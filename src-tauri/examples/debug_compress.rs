use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use app_lib::utils::image_utils::compress_image_to_webp;

fn main() {
    println!("=== 图片压缩性能调试工具 ===\n");

    let test_image_path = get_test_image_path();

    if !test_image_path.exists() {
        eprintln!("错误: 找不到测试图片: {}", test_image_path.display());
        eprintln!("请将测试图片放在以下位置之一:");
        eprintln!("1. {}", test_image_path.display());
        eprintln!("2. 或者修改代码中的路径");
        return;
    }

    println!("测试图片: {}", test_image_path.display());
    println!("文件大小: {} bytes\n", fs::metadata(&test_image_path).unwrap().len());

    run_compression_test(&test_image_path);

    println!("\n=== 测试完成 ===");
}

fn get_test_image_path() -> PathBuf {
    let path = PathBuf::from(r"D:\漫展\P1002642.JPG");
    // let mut path = std::env::current_dir().unwrap();
    // path.push("test_image.jpg");
    //
    // if !path.exists() {
    //     path = std::env::temp_dir();
    //     path.push("test_image.jpg");
    // }

    path
}

fn run_compression_test(input_path: &PathBuf) {
    println!("开始压缩测试...\n");

    let total_start = Instant::now();

    let result = compress_image_to_webp(input_path);

    let total_time = total_start.elapsed();

    match result {
        Ok(_) => {
            let output_path = input_path.with_extension("webp");
            let output_size = fs::metadata(&output_path).unwrap().len();
            let input_size = fs::metadata(input_path).unwrap().len();
            let compression_ratio = (1.0 - (output_size as f64 / input_size as f64)) * 100.0;

            println!("✓ 压缩成功!");
            println!("  输出文件: {}", output_path.display());
            println!("  输出大小: {} bytes ({:.2} KB)", output_size, output_size as f64 / 1024.0);
            println!("  压缩率: {:.2}%", compression_ratio);
            println!("  总耗时: {:?}", total_time);

            if total_time.as_secs() > 5 {
                println!("\n⚠ 警告: 压缩时间过长 (>{:?})", total_time);
                println!("可能的原因:");
                println!("  1. 图片尺寸过大");
                println!("  2. WebP 编码器性能问题");
                println!("  3. 缩放算法 (Lanczos3) 计算量大");
                println!("  4. 磁盘 I/O 瓶颈");
            }
        }
        Err(e) => {
            println!("✗ 压缩失败: {}", e);
            println!("  总耗时: {:?}", total_time);
        }
    }
}
