use image::{DynamicImage, ImageBuffer, Rgb, Rgba, Luma};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::time::Instant;

fn main() {
    println!("=== JPEG 解码详细分析 ===\n");
    
    let input_path = Path::new(r"D:\漫展\P1002642.JPG");
    
    if !input_path.exists() {
        eprintln!("错误: 找不到测试图片");
        return;
    }
    
    let metadata = std::fs::metadata(input_path).unwrap();
    println!("文件: {}", input_path.display());
    println!("大小: {} bytes ({:.2} MB)\n", metadata.len(), metadata.len() as f64 / 1024.0 / 1024.0);
    
    analyze_decode_steps(input_path);
}

fn analyze_decode_steps(input_path: &Path) {
    let total_start = Instant::now();
    
    println!("步骤1: 读取文件到内存");
    let read_start = Instant::now();
    let mut file = File::open(input_path).unwrap();
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).unwrap();
    let read_time = read_start.elapsed();
    println!("  耗时: {:?} ({:.2} MB/s)", read_time, buffer.len() as f64 / 1024.0 / 1024.0 / read_time.as_secs_f64());
    
    println!("\n步骤2: 创建解码器");
    let create_start = Instant::now();
    let mut decoder = zune_jpeg::JpegDecoder::new(&buffer);
    let create_time = create_start.elapsed();
    println!("  耗时: {:?}", create_time);
    
    println!("\n步骤3: 解码像素数据");
    let decode_start = Instant::now();
    let decoded = decoder.decode().unwrap();
    let decode_time = decode_start.elapsed();
    println!("  耗时: {:?}", decode_time);
    
    println!("\n步骤4: 获取图片信息");
    let info_start = Instant::now();
    let info = decoder.info().unwrap();
    let info_time = info_start.elapsed();
    println!("  耗时: {:?}", info_time);
    println!("  尺寸: {}x{}", info.width, info.height);
    println!("  通道数: {}", info.components);
    println!("  像素数: {}", (info.width as u64) * (info.height as u64));
    println!("  解码速度: {:.2} MP/s", (info.width as u64 * info.height as u64) as f64 / 1_000_000.0 / decode_time.as_secs_f64());
    
    println!("\n步骤5: 创建 ImageBuffer");
    let buffer_start = Instant::now();
    let result = create_image_buffer(&decoded, info.width as usize, info.height as usize, info.components);
    let buffer_time = buffer_start.elapsed();
    println!("  耗时: {:?}", buffer_time);
    
    let total_time = total_start.elapsed();
    
    println!("\n=== 性能总结 ===");
    println!("总耗时: {:?}", total_time);
    println!("  - 读取文件: {:?} ({:.1}%)", read_time, read_time.as_secs_f64() / total_time.as_secs_f64() * 100.0);
    println!("  - 创建解码器: {:?} ({:.1}%)", create_time, create_time.as_secs_f64() / total_time.as_secs_f64() * 100.0);
    println!("  - 获取信息: {:?} ({:.1}%)", info_time, info_time.as_secs_f64() / total_time.as_secs_f64() * 100.0);
    println!("  - 解码数据: {:?} ({:.1}%)", decode_time, decode_time.as_secs_f64() / total_time.as_secs_f64() * 100.0);
    println!("  - 创建Buffer: {:?} ({:.1}%)", buffer_time, buffer_time.as_secs_f64() / total_time.as_secs_f64() * 100.0);
    
    println!("\n=== 瓶颈分析 ===");
    let decode_ratio = decode_time.as_secs_f64() / total_time.as_secs_f64();
    let buffer_ratio = buffer_time.as_secs_f64() / total_time.as_secs_f64();
    
    if decode_ratio > 0.5 {
        println!("主要瓶颈: zune-jpeg 解码 ({:.1}%)", decode_ratio * 100.0);
        println!("建议: 尝试其他 JPEG 解码库，如:");
        println!("  - mozjpeg (高性能)");
        println!("  - libjpeg-turbo (C库，通过FFI调用)");
        println!("  - image-rs 的默认解码器");
    } else if buffer_ratio > 0.5 {
        println!("主要瓶颈: ImageBuffer 创建 ({:.1}%)", buffer_ratio * 100.0);
        println!("建议: 可能是内存分配问题，考虑:");
        println!("  - 预分配内存");
        println!("  - 使用更高效的数据结构");
    } else {
        println!("性能分布比较均衡");
    }
}

fn create_image_buffer(decoded: &[u8], width: usize, height: usize, components: u8) -> Option<DynamicImage> {
    match components {
        3 => {
            let buffer: ImageBuffer<Rgb<u8>, _> = ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())?;
            Some(DynamicImage::ImageRgb8(buffer))
        }
        4 => {
            let buffer: ImageBuffer<Rgba<u8>, _> = ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())?;
            Some(DynamicImage::ImageRgba8(buffer))
        }
        1 => {
            let buffer: ImageBuffer<Luma<u8>, _> = ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())?;
            Some(DynamicImage::ImageLuma8(buffer))
        }
        _ => None,
    }
}
