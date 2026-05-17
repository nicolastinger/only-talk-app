use std::fs::File;
use std::io::{BufReader, Read, Write};
use std::path::Path;
use std::time::Instant;

use anyhow::{anyhow, Result};
use image::imageops::FilterType;
use image::{DynamicImage, ImageBuffer, ImageReader, Luma, Rgb, Rgba};

const MAX_INPUT_SIZE: u64 = 100 * 1024 * 1024;
const MAX_OUTPUT_SIZE: u64 = 200 * 1024;
const TARGET_QUALITY: u8 = 80;
const MAX_DIMENSION: u32 = 800;

fn main() {
    println!("=== 详细性能分析工具 ===\n");

    let input_path = Path::new(r"D:\漫展\P1002642.JPG");

    if !input_path.exists() {
        eprintln!("错误: 找不到测试图片");
        return;
    }

    let metadata = std::fs::metadata(input_path).unwrap();
    println!("输入文件: {}", input_path.display());
    println!(
        "文件大小: {} bytes ({:.2} MB)\n",
        metadata.len(),
        metadata.len() as f64 / 1024.0 / 1024.0
    );

    if let Err(e) = compress_with_detailed_timing(input_path) {
        eprintln!("压缩失败: {}", e);
    }
}

fn compress_with_detailed_timing(input_path: &Path) -> Result<()> {
    let total_start = Instant::now();

    let metadata = std::fs::metadata(input_path)?;
    if metadata.len() > MAX_INPUT_SIZE {
        return Err(anyhow!("输入图片大小不能超过100MB"));
    }

    println!("步骤1: 解码图片");
    let decode_start = Instant::now();

    let img = decode_and_compare(input_path)?;

    let decode_time = decode_start.elapsed();
    println!("  解码耗时: {:?}\n", decode_time);

    let (width, height) = (img.width(), img.height());
    println!("图片尺寸: {}x{} ({} 像素)", width, height, width * height);

    let img_to_encode = if width > MAX_DIMENSION || height > MAX_DIMENSION {
        println!("\n步骤2: 缩放图片");
        let scale = (MAX_DIMENSION as f64 / width.max(height) as f64).min(1.0);
        let new_width = ((width as f64 * scale) as u32).max(1);
        let new_height = ((height as f64 * scale) as u32).max(1);
        println!("  目标尺寸: {}x{}", new_width, new_height);

        let resize_start = Instant::now();
        let resized = img.resize(new_width, new_height, FilterType::Lanczos3);
        let resize_time = resize_start.elapsed();
        println!("  Lanczos3 缩放耗时: {:?}\n", resize_time);

        resized
    } else {
        println!("无需缩放\n");
        img
    };

    println!("步骤3: WebP 编码");
    let encode_start = Instant::now();

    let final_data = encode_to_webp(&img_to_encode)?;

    let encode_time = encode_start.elapsed();
    println!("  编码耗时: {:?}", encode_time);
    println!(
        "  输出大小: {} bytes ({:.2} KB)\n",
        final_data.len(),
        final_data.len() as f64 / 1024.0
    );

    let output_path = input_path.with_extension("webp");
    let write_start = Instant::now();
    let mut output_file = File::create(&output_path)?;
    output_file.write_all(&final_data)?;
    let write_time = write_start.elapsed();
    println!("步骤4: 写入文件: {:?}", write_time);

    let total_time = total_start.elapsed();
    println!("\n=== 性能总结 ===");
    println!("总耗时: {:?}", total_time);
    println!(
        "  - 解码: {:?} ({:.1}%)",
        decode_time,
        decode_time.as_secs_f64() / total_time.as_secs_f64() * 100.0
    );
    println!(
        "  - 缩放: {:?} ({:.1}%)",
        total_time - decode_time - encode_time - write_time,
        (total_time - decode_time - encode_time - write_time).as_secs_f64()
            / total_time.as_secs_f64()
            * 100.0
    );
    println!(
        "  - 编码: {:?} ({:.1}%)",
        encode_time,
        encode_time.as_secs_f64() / total_time.as_secs_f64() * 100.0
    );
    println!(
        "  - 写入: {:?} ({:.1}%)",
        write_time,
        write_time.as_secs_f64() / total_time.as_secs_f64() * 100.0
    );

    if total_time.as_secs() > 5 {
        println!("\n⚠ 性能瓶颈分析:");
        let decode_ratio = decode_time.as_secs_f64() / total_time.as_secs_f64();
        let encode_ratio = encode_time.as_secs_f64() / total_time.as_secs_f64();

        if decode_ratio > 0.5 {
            println!("  主要瓶颈: 解码 ({:.1}%)", decode_ratio * 100.0);
            println!("  建议: 检查是否使用了优化的解码器");
        } else if encode_ratio > 0.5 {
            println!("  主要瓶颈: 编码 ({:.1}%)", encode_ratio * 100.0);
            println!("  建议: 考虑降低质量或使用更快的编码器");
        } else {
            println!("  主要瓶颈: 缩放或其他操作");
            println!("  建议: 考虑使用更快的缩放算法");
        }
    }

    Ok(())
}

fn decode_and_compare(input_path: &Path) -> Result<DynamicImage> {
    let extension =
        input_path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_lowercase());

    match extension.as_deref() {
        Some("jpg") | Some("jpeg") => {
            println!("  检测到 JPEG，使用 zune-jpeg 解码器");
            decode_jpeg_fast(input_path)
        }
        _ => {
            println!("  使用 image crate 默认解码器");
            let file = File::open(input_path)?;
            let mut buf_reader = BufReader::new(file);
            let img = ImageReader::new(&mut buf_reader).with_guessed_format()?.decode()?;
            Ok(img)
        }
    }
}

fn decode_jpeg_fast(input_path: &Path) -> Result<DynamicImage> {
    let mut file = File::open(input_path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;

    let mut decoder = zune_jpeg::JpegDecoder::new(&buffer);
    let decoded = decoder.decode()?;

    let info = decoder.info().ok_or_else(|| anyhow!("Failed to get JPEG info"))?;
    let width = info.width;
    let height = info.height;
    let components = info.components;

    println!("  JPEG 信息: {}x{}, {} 通道", width, height, components);

    match components {
        3 => {
            let buffer: ImageBuffer<Rgb<u8>, _> =
                ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())
                    .ok_or_else(|| anyhow!("Failed to create RGB buffer"))?;
            Ok(DynamicImage::ImageRgb8(buffer))
        }
        4 => {
            let buffer: ImageBuffer<Rgba<u8>, _> =
                ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())
                    .ok_or_else(|| anyhow!("Failed to create RGBA buffer"))?;
            Ok(DynamicImage::ImageRgba8(buffer))
        }
        1 => {
            let buffer: ImageBuffer<Luma<u8>, _> =
                ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())
                    .ok_or_else(|| anyhow!("Failed to create Luma buffer"))?;
            Ok(DynamicImage::ImageLuma8(buffer))
        }
        _ => Err(anyhow!("Unsupported JPEG components: {}", components)),
    }
}

fn encode_to_webp(img: &DynamicImage) -> Result<Vec<u8>> {
    let encoder =
        webp::Encoder::from_image(img).map_err(|e| anyhow!("WebP encoder error: {}", e))?;
    let webp_data = encoder.encode(TARGET_QUALITY as f32);
    Ok(webp_data.to_vec())
}
