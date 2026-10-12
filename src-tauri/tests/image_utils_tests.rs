#![cfg(test)]

use app_lib::config::set_config;
use app_lib::utils::global_static_str::MONTHLY_RESOURCE_PATH;
use app_lib::utils::image_utils::compress_image_to_webp;
use std::fs;
use std::io::Read;
use std::io::Write;
use std::path::PathBuf;

/// 压缩输出目录由配置 `monthly_resources` 决定(运行时由 init_app 种下),
/// 测试中手动种一份临时目录, 避免 "获取当月资源路径失败"。
fn init_monthly_path() -> PathBuf {
    let dir = std::env::temp_dir().join("onlytalk_img_test");
    fs::create_dir_all(&dir).expect("创建测试目录失败");
    set_config(MONTHLY_RESOURCE_PATH, dir.to_str().expect("路径转字符串失败"));
    dir
}

fn create_test_image() -> PathBuf {
    let temp_dir = std::env::temp_dir();
    let path = temp_dir.join("test_input.png");

    let width = 800u32;
    let height = 600u32;
    let img = image::RgbaImage::from_pixel(width, height, image::Rgba([100, 150, 200, 255]));
    img.save(&path).expect("保存测试图片失败");

    path
}

#[test]
fn test_compress_image_to_webp_success() {
    init_monthly_path();
    let input_path = create_test_image();

    let output_path = compress_image_to_webp(&input_path).expect("压缩应成功");

    assert!(output_path.exists(), "Output file should exist");

    let output_size = fs::metadata(&output_path).expect("读取输出文件元数据失败").len();
    assert!(output_size <= 200 * 1024, "Output size should be <= 200KB, got {} bytes", output_size);

    fs::remove_file(&input_path).ok();
    fs::remove_file(&output_path).ok();
}

#[test]
fn test_compress_image_to_webp_exceeds_max_input_size() {
    let temp_dir = std::env::temp_dir();
    let large_path = temp_dir.join("large_test_input.png");

    {
        let mut file = fs::File::create(&large_path).expect("创建大文件失败");
        let zeros = vec![0u8; 101 * 1024 * 1024];
        file.write_all(&zeros).expect("写入大文件失败");
    }

    let result = compress_image_to_webp(&large_path);

    assert!(result.is_err(), "Should fail for input > 100MB");
    assert!(result.unwrap_err().to_string().contains("100MB"));

    fs::remove_file(&large_path).ok();
}

#[test]
fn test_compress_image_output_is_webp() {
    init_monthly_path();
    let input_path = create_test_image();

    let output_path = compress_image_to_webp(&input_path).expect("压缩应成功");

    let mut file = fs::File::open(&output_path).expect("打开输出文件失败");
    let mut header = [0u8; 4];
    file.read_exact(&mut header).expect("读取文件头失败");

    assert_eq!(&header, b"RIFF", "WebP file should start with RIFF");

    fs::remove_file(&input_path).ok();
    fs::remove_file(&output_path).ok();
}

#[test]
fn test_compress_image_preserves_aspect_ratio() {
    init_monthly_path();
    let temp_dir = std::env::temp_dir();
    let input_path = temp_dir.join("rect_test.png");

    let width = 1600u32;
    let height = 900u32;
    let img = image::RgbaImage::from_pixel(width, height, image::Rgba([255, 0, 0, 255]));
    img.save(&input_path).expect("保存测试图片失败");

    let output_path = compress_image_to_webp(&input_path).expect("压缩应成功");

    let loaded = image::open(&output_path).expect("打开输出图片失败");

    let output_width = loaded.width() as f64;
    let output_height = loaded.height() as f64;
    let original_ratio = width as f64 / height as f64;
    let output_ratio = output_width / output_height;

    let ratio_diff = (original_ratio - output_ratio).abs();
    assert!(
        ratio_diff < 0.01,
        "Aspect ratio should be preserved: original={}, output={}",
        original_ratio,
        output_ratio
    );

    fs::remove_file(&input_path).ok();
    fs::remove_file(&output_path).ok();
}