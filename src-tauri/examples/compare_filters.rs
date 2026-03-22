use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::time::Instant;

use anyhow::Result;
use image::imageops::FilterType;
use image::{DynamicImage, ImageBuffer, Luma, Rgb, Rgba};

fn main() {
    println!("=== 缩放算法性能对比 ===\n");

    let input_path = Path::new(r"D:\漫展\P1002642.JPG");

    if !input_path.exists() {
        eprintln!("错误: 找不到测试图片");
        return;
    }

    let img = decode_jpeg(input_path).unwrap();
    let (width, height) = (img.width(), img.height());
    let target_size = 800u32;

    println!("原始尺寸: {}x{} ({} 像素)", width, height, width * height);
    println!("目标尺寸: {}x{}\n", target_size, target_size);

    let filters = vec![
        ("Nearest", FilterType::Nearest),
        ("Triangle", FilterType::Triangle),
        ("CatmullRom", FilterType::CatmullRom),
        ("Gaussian", FilterType::Gaussian),
        ("Lanczos3", FilterType::Lanczos3),
    ];

    println!("测试不同缩放算法:\n");
    println!("{:<15} {:<15} {:<15} {:<15}", "算法", "耗时", "输出大小", "质量评分");
    println!("{}", "-".repeat(60));

    for (name, filter) in filters {
        let result = benchmark_resize(&img, target_size, filter, &name);
        if let Some((time, output_size, quality)) = result {
            println!(
                "{:<15} {:<15} {:<15} {:<15}",
                name,
                format!("{:?}", time),
                format!("{:.2} KB", output_size as f64 / 1024.0),
                quality
            );
        }
    }

    println!("\n=== 推荐建议 ===");
    println!("1. Nearest: 最快，但质量较差，适合预览");
    println!("2. Triangle: 速度快，质量中等，推荐用于缩略图");
    println!("3. CatmullRom: 速度中等，质量较好");
    println!("4. Gaussian: 速度中等，质量较好");
    println!("5. Lanczos3: 最慢，质量最好，适合最终输出");
}

fn benchmark_resize(
    img: &DynamicImage,
    target_size: u32,
    filter: FilterType,
    name: &str,
) -> Option<(std::time::Duration, usize, &'static str)> {
    let scale = (target_size as f64 / img.width().max(img.height()) as f64).min(1.0);
    let new_width = ((img.width() as f64 * scale) as u32).max(1);
    let new_height = ((img.height() as f64 * scale) as u32).max(1);

    let start = Instant::now();
    let resized = img.resize(new_width, new_height, filter);
    let duration = start.elapsed();

    let output_size = estimate_output_size(&resized);
    let quality = quality_score(name);

    Some((duration, output_size, quality))
}

fn decode_jpeg(input_path: &Path) -> Result<DynamicImage> {
    let mut file = File::open(input_path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;

    let mut decoder = zune_jpeg::JpegDecoder::new(&buffer);
    let decoded = decoder.decode()?;

    let info = decoder.info().ok_or_else(|| anyhow::anyhow!("Failed to get JPEG info"))?;
    let width = info.width;
    let height = info.height;
    let components = info.components;

    match components {
        3 => {
            let buffer: ImageBuffer<Rgb<u8>, _> =
                ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())
                    .ok_or_else(|| anyhow::anyhow!("Failed to create RGB buffer"))?;
            Ok(DynamicImage::ImageRgb8(buffer))
        }
        4 => {
            let buffer: ImageBuffer<Rgba<u8>, _> =
                ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())
                    .ok_or_else(|| anyhow::anyhow!("Failed to create RGBA buffer"))?;
            Ok(DynamicImage::ImageRgba8(buffer))
        }
        1 => {
            let buffer: ImageBuffer<Luma<u8>, _> =
                ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())
                    .ok_or_else(|| anyhow::anyhow!("Failed to create Luma buffer"))?;
            Ok(DynamicImage::ImageLuma8(buffer))
        }
        _ => Err(anyhow::anyhow!("Unsupported JPEG components: {}", components)),
    }
}

fn estimate_output_size(img: &DynamicImage) -> usize {
    let width = img.width();
    let height = img.height();
    let bytes_per_pixel = match img.color() {
        image::ColorType::Rgb8 => 3,
        image::ColorType::Rgba8 => 4,
        image::ColorType::L8 => 1,
        image::ColorType::La8 => 2,
        _ => 4,
    };
    (width * height * bytes_per_pixel) as usize
}

fn quality_score(name: &str) -> &'static str {
    match name {
        "Nearest" => "⭐",
        "Triangle" => "⭐⭐⭐",
        "CatmullRom" => "⭐⭐⭐⭐",
        "Gaussian" => "⭐⭐⭐⭐",
        "Lanczos3" => "⭐⭐⭐⭐⭐",
        _ => "?",
    }
}
