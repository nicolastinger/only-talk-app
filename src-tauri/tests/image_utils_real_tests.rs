#![cfg(test)]

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use app_lib::config::set_config;
use app_lib::utils::global_static_str::MONTHLY_RESOURCE_PATH;
use app_lib::utils::image_utils::compress_image_to_webp;
use image::{ImageBuffer, Rgb};

/// 确定性线性同余伪随机(不引入 rand 依赖), 返回一个字节。
fn next_rand(state: &mut u64) -> u8 {
    *state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    (*state >> 40) as u8
}

/// 生成图片的默认分辨率(对齐主流手机相机 12MP), 使输入文件达到 MB 量级。
const IMG_WIDTH: u32 = 4000;
const IMG_HEIGHT: u32 = 3000;

/// 返回 [-64, 63] 范围内的随机抖动。
fn next_jitter(state: &mut u64) -> i8 {
    (next_rand(state) % 128) as i8 - 64
}

/// 随机生成一张有结构的测试图片(随机色块 + 强抖动), 保证内容随机且文件较大。
///
/// 分辨率(4000x3000)远超 `MAX_DIMENSION`(800), 以覆盖压缩中的「缩放」分支。
fn generate_random_image(path: &Path, width: u32, height: u32) {
    const BLOCK: u32 = 24;
    let mut state = 0x9E37_79B9_7F4A_7C15u64;
    let mut block_color = [0u8; 3];

    let mut img = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(width, height);
    for y in 0..height {
        for x in 0..width {
            // 每 BLOCK 像素刷新一次色块基色
            if x % BLOCK == 0 && y % BLOCK == 0 {
                block_color =
                    [next_rand(&mut state), next_rand(&mut state), next_rand(&mut state)];
            }
            // 基色上叠加 ±64 的随机抖动
            let pixel = Rgb([
                block_color[0].saturating_add_signed(next_jitter(&mut state)),
                block_color[1].saturating_add_signed(next_jitter(&mut state)),
                block_color[2].saturating_add_signed(next_jitter(&mut state)),
            ]);
            img.put_pixel(x, y, pixel);
        }
    }

    img.save(path).expect("保存随机生成的图片失败");
}

#[test]
fn test_compress_generated_random_image() {
    // 独立临时工作目录, 避免污染本机资源目录
    let work_dir = std::env::temp_dir()
        .join(format!("only_talk_image_compress_{}", std::process::id()));
    fs::remove_dir_all(&work_dir).ok();
    fs::create_dir_all(&work_dir).expect("创建临时目录失败");

    // compress_image_to_webp 的输出目录来自当月资源目录配置
    set_config(MONTHLY_RESOURCE_PATH, work_dir.to_str().expect("路径转换失败"));

    // 生成 .jpg 输入, 覆盖 zune-jpeg 快速解码分支
    let input_path = work_dir.join("generated_random.jpg");
    generate_random_image(&input_path, IMG_WIDTH, IMG_HEIGHT);

    let input_size = fs::metadata(&input_path).expect("读取输入文件元数据失败").len();
    println!("生成图片大小: {} bytes ({:.2} KB)", input_size, input_size as f64 / 1024.0);

    let output_path: PathBuf = compress_image_to_webp(&input_path).expect("压缩失败");

    assert!(output_path.exists(), "输出文件不存在: {:?}", output_path);
    assert_eq!(output_path.extension().and_then(|e| e.to_str()), Some("webp"));

    let output_size = fs::metadata(&output_path).expect("读取输出文件元数据失败").len();
    println!("压缩后大小: {} bytes ({:.2} KB)", output_size, output_size as f64 / 1024.0);

    assert!(output_size > 0, "输出文件为空");
    assert!(output_size < input_size, "压缩后应更小: {} -> {}", input_size, output_size);

    let mut file_handle = fs::File::open(&output_path).expect("打开输出文件失败");
    let mut header = [0u8; 4];
    file_handle.read_exact(&mut header).expect("读取文件头失败");
    assert_eq!(&header, b"RIFF", "WebP 文件应以 RIFF 开头");

    fs::remove_dir_all(&work_dir).ok();
}
