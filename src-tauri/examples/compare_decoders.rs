use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use std::time::Instant;

use image::{DynamicImage, ImageBuffer, ImageReader, Luma, Rgb, Rgba};

fn main() {
    println!("=== JPEG 解码器性能对比 ===\n");

    let input_path = Path::new(r"D:\漫展\P1002642.JPG");

    if !input_path.exists() {
        eprintln!("错误: 找不到测试图片");
        return;
    }

    let metadata = std::fs::metadata(input_path).unwrap();
    println!("测试图片: {}", input_path.display());
    println!(
        "文件大小: {} bytes ({:.2} MB)\n",
        metadata.len(),
        metadata.len() as f64 / 1024.0 / 1024.0
    );

    println!("对比不同解码器:\n");
    println!("{:<20} {:<15} {:<15} {:<15}", "解码器", "耗时", "速度", "内存分配");
    println!("{}", "-".repeat(65));

    let file_data = read_file_to_memory(input_path);

    let zune_result = test_zune_jpeg(&file_data);
    let image_rs_result = test_image_rs_decoder(input_path);

    if let Some((time, speed, mem)) = zune_result {
        println!(
            "{:<20} {:<15} {:<15} {:<15}",
            "zune-jpeg",
            format!("{:?}", time),
            format!("{:.2} MP/s", speed),
            format!("{:.2} MB", mem)
        );
    }

    if let Some((time, speed, mem)) = image_rs_result {
        println!(
            "{:<20} {:<15} {:<15} {:<15}",
            "image-rs",
            format!("{:?}", time),
            format!("{:.2} MP/s", speed),
            format!("{:.2} MB", mem)
        );
    }

    println!("\n=== 性能总结 ===");

    if let (Some(zune), Some(image_rs)) = (zune_result, image_rs_result) {
        let speedup = zune.0.as_secs_f64() / image_rs.0.as_secs_f64();
        if speedup > 1.0 {
            println!("image-rs 解码器比 zune-jpeg 快 {:.2} 倍", speedup);
            println!("建议: 使用 image-rs 的默认解码器");
        } else {
            println!("zune-jpeg 解码器比 image-rs 快 {:.2} 倍", 1.0 / speedup);
            println!("建议: 继续使用 zune-jpeg");
        }
    }
}

fn read_file_to_memory(path: &Path) -> Vec<u8> {
    let mut file = File::open(path).unwrap();
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).unwrap();
    buffer
}

fn test_zune_jpeg(file_data: &[u8]) -> Option<(std::time::Duration, f64, f64)> {
    let start = Instant::now();

    let mut decoder = zune_jpeg::JpegDecoder::new(file_data);
    let decoded = decoder.decode().ok()?;
    let info = decoder.info()?;

    let decode_time = start.elapsed();

    let pixels = (info.width as u64) * (info.height as u64);
    let speed = pixels as f64 / 1_000_000.0 / decode_time.as_secs_f64();
    let memory = decoded.len() as f64 / 1024.0 / 1024.0;

    Some((decode_time, speed, memory))
}

fn test_image_rs_decoder(path: &Path) -> Option<(std::time::Duration, f64, f64)> {
    let start = Instant::now();

    let file = File::open(path).ok()?;
    let buf_reader = BufReader::new(file);
    let img = ImageReader::new(buf_reader).with_guessed_format().ok()?.decode().ok()?;

    let decode_time = start.elapsed();

    let pixels = (img.width() as u64) * (img.height() as u64);
    let speed = pixels as f64 / 1_000_000.0 / decode_time.as_secs_f64();

    let bytes_per_pixel = match img.color() {
        image::ColorType::Rgb8 => 3,
        image::ColorType::Rgba8 => 4,
        image::ColorType::L8 => 1,
        image::ColorType::La8 => 2,
        _ => 4,
    };
    let memory = (pixels * bytes_per_pixel as u64) as f64 / 1024.0 / 1024.0;

    Some((decode_time, speed, memory))
}
