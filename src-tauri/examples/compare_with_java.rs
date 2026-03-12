use image::{DynamicImage, ImageBuffer, Rgb, Rgba, Luma, ImageReader};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use std::time::Instant;

fn main() {
    println!("=== 解码器性能深度分析 ===\n");
    
    let input_path = Path::new(r"D:\漫展\P1002642.JPG");
    
    if !input_path.exists() {
        eprintln!("错误: 找不到测试图片");
        return;
    }
    
    let metadata = std::fs::metadata(input_path).unwrap();
    println!("测试图片: {}", input_path.display());
    println!("文件大小: {} bytes ({:.2} MB)\n", metadata.len(), metadata.len() as f64 / 1024.0 / 1024.0);
    
    println!("对比不同解码方式:\n");
    println!("{:<30} {:<15} {:<15}", "解码方式", "耗时", "对比Java");
    println!("{}", "-".repeat(60));
    
    let java_time = std::time::Duration::from_millis(392);
    println!("{:<30} {:<15} {:<15}", "Java ImageIO.read()", format!("{:?}", java_time), "基准");
    
    let zune_result = test_zune_full(input_path);
    let image_rs_result = test_image_rs_full(input_path);
    
    if let Some(time) = zune_result {
        let ratio = time.as_secs_f64() / java_time.as_secs_f64();
        println!("{:<30} {:<15} {:<15}", "zune-jpeg (完整流程)", format!("{:?}", time), format!("慢 {:.1}x", ratio));
    }
    
    if let Some(time) = image_rs_result {
        let ratio = time.as_secs_f64() / java_time.as_secs_f64();
        println!("{:<30} {:<15} {:<15}", "image-rs (完整流程)", format!("{:?}", time), format!("慢 {:.1}x", ratio));
    }
    
    println!("\n=== 分析 ===");
    println!("Java使用的是底层C库（如libjpeg-turbo），性能非常优秀。");
    println!("Rust版本慢的原因可能是：");
    println!("1. 解码器实现不够优化");
    println!("2. 内存分配和拷贝过多");
    println!("3. 没有使用SIMD指令优化");
}

fn test_zune_full(input_path: &Path) -> Option<std::time::Duration> {
    let start = Instant::now();
    
    let mut file = File::open(input_path).ok()?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).ok()?;
    
    let mut decoder = zune_jpeg::JpegDecoder::new(&buffer);
    let decoded = decoder.decode().ok()?;
    let info = decoder.info()?;
    
    let img = match info.components {
        3 => {
            let buffer: ImageBuffer<Rgb<u8>, _> = ImageBuffer::from_raw(info.width as u32, info.height as u32, decoded.to_vec())?;
            Some(DynamicImage::ImageRgb8(buffer))
        }
        4 => {
            let buffer: ImageBuffer<Rgba<u8>, _> = ImageBuffer::from_raw(info.width as u32, info.height as u32, decoded.to_vec())?;
            Some(DynamicImage::ImageRgba8(buffer))
        }
        1 => {
            let buffer: ImageBuffer<Luma<u8>, _> = ImageBuffer::from_raw(info.width as u32, info.height as u32, decoded.to_vec())?;
            Some(DynamicImage::ImageLuma8(buffer))
        }
        _ => None,
    };
    
    img?;
    
    Some(start.elapsed())
}

fn test_image_rs_full(input_path: &Path) -> Option<std::time::Duration> {
    let start = Instant::now();
    
    let file = File::open(input_path).ok()?;
    let buf_reader = BufReader::new(file);
    let img = ImageReader::new(buf_reader)
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;
    
    let _ = img.width();
    let _ = img.height();
    
    Some(start.elapsed())
}
