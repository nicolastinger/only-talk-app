use std::fs::File;
use std::io::{BufReader, Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;

use anyhow::{anyhow, Result};
use exif::Reader;
use image::imageops::FilterType;
use image::{DynamicImage, ImageBuffer, ImageReader, Luma, Rgb, Rgba};
use log::info;

use crate::config::get_config;
use crate::utils::global_static_str::MONTHLY_RESOURCE_PATH;

const MAX_INPUT_SIZE: u64 = 100 * 1024 * 1024;
const MAX_OUTPUT_SIZE: u64 = 200 * 1024;
const TARGET_QUALITY: u8 = 80;
const MAX_DIMENSION: u32 = 800;

pub fn compress_image_to_webp(input_path: &std::path::Path) -> Result<PathBuf> {
    let start = Instant::now();

    let metadata = std::fs::metadata(input_path)?;
    info!("[压缩] 文件大小: {} bytes", metadata.len());

    if metadata.len() > MAX_INPUT_SIZE {
        return Err(anyhow!("输入图片大小不能超过100MB"));
    }

    info!("[压缩] 开始解码图片...");
    let decode_start = Instant::now();

    let img = decode_image_optimized(input_path)?;

    let decode_time = decode_start.elapsed();
    info!("[压缩] 解码完成，耗时: {:?}", decode_time);

    let (width, height) = (img.width(), img.height());
    info!("[压缩] 图片尺寸: {}x{}", width, height);

    let img_to_encode = if width > MAX_DIMENSION || height > MAX_DIMENSION {
        let scale = (MAX_DIMENSION as f64 / width.max(height) as f64).min(1.0);
        let new_width = ((width as f64 * scale) as u32).max(1);
        let new_height = ((height as f64 * scale) as u32).max(1);
        info!("[压缩] 缩放到: {}x{}", new_width, new_height);
        img.resize(new_width, new_height, FilterType::Triangle)
    } else {
        img
    };

    info!("[压缩] 开始编码 WebP...");
    let encode_start = Instant::now();

    let final_data = encode_to_webp(&img_to_encode)?;

    let encode_time = encode_start.elapsed();
    info!("[压缩] 编码完成，耗时: {:?}, 大小: {} bytes", encode_time, final_data.len());

    let output_path = get_output_path(input_path)?;

    if final_data.len() > MAX_OUTPUT_SIZE as usize {
        info!("[压缩] 文件仍然过大，继续缩放...");
        let target_ratio = (MAX_OUTPUT_SIZE as f64 / final_data.len() as f64).sqrt();
        let scale = (target_ratio * 100.0).min(100.0) as u32;

        let new_width = ((img_to_encode.width() as f64 * scale as f64 / 100.0) as u32).max(1);
        let new_height = ((img_to_encode.height() as f64 * scale as f64 / 100.0) as u32).max(1);

        info!("[压缩] 继续缩放到: {}x{}", new_width, new_height);

        let resized = img_to_encode.resize(new_width, new_height, FilterType::Triangle);
        let final_data = encode_to_webp(&resized)?;
        info!("[压缩] 缩放后编码完成，大小: {} bytes", final_data.len());

        let mut output_file = File::create(&output_path)?;
        output_file.write_all(&final_data)?;

        let total_time = start.elapsed();
        info!("[压缩] 总耗时: {:?}", total_time);
        info!("[压缩] 输出路径: {:?}", output_path);

        return Ok(output_path);
    }

    let mut output_file = File::create(&output_path)?;
    output_file.write_all(&final_data)?;

    let total_time = start.elapsed();
    info!("[压缩] 总耗时: {:?}", total_time);
    info!("[压缩] 输出路径: {:?}", output_path);

    Ok(output_path)
}

fn get_output_path(input_path: &std::path::Path) -> Result<PathBuf> {
    let monthly_resource_path = get_config(MONTHLY_RESOURCE_PATH)
        .ok_or_else(|| anyhow!("获取当月资源路径失败"))?;

    let file_stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let output_filename = format!("{}_{}.webp", file_stem, timestamp);
    let output_path = Path::new(&monthly_resource_path).join(output_filename);

    Ok(output_path)
}

fn encode_to_webp(img: &DynamicImage) -> Result<Vec<u8>> {
    let encoder =
        webp::Encoder::from_image(img).map_err(|e| anyhow!("WebP encoder error: {}", e))?;
    let webp_data = encoder.encode(TARGET_QUALITY as f32);
    Ok(webp_data.to_vec())
}

fn decode_image_optimized(input_path: &std::path::Path) -> Result<DynamicImage> {
    let extension =
        input_path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_lowercase());

    match extension.as_deref() {
        Some("jpg") | Some("jpeg") => {
            info!("[压缩] 使用zune-jpeg优化JPEG解码");
            decode_jpeg_fast(input_path)
        }
        _ => {
            info!("[压缩] 使用image crate解码");
            let file = File::open(input_path)?;
            let mut buf_reader = BufReader::new(file);
            let img = ImageReader::new(&mut buf_reader).with_guessed_format()?.decode()?;
            Ok(img)
        }
    }
}

fn decode_jpeg_fast(input_path: &std::path::Path) -> Result<DynamicImage> {
    let mut file = File::open(input_path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;

    let orientation = get_exif_orientation(&buffer);

    let mut decoder = zune_jpeg::JpegDecoder::new(&buffer);
    let decoded = decoder.decode()?;

    let info = decoder.info().ok_or_else(|| anyhow!("Failed to get JPEG info"))?;
    let width = info.width;
    let height = info.height;
    let components = info.components;

    let mut img = match components {
        3 => {
            let buffer: ImageBuffer<Rgb<u8>, _> =
                ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())
                    .ok_or_else(|| anyhow!("Failed to create RGB buffer"))?;
            DynamicImage::ImageRgb8(buffer)
        }
        4 => {
            let buffer: ImageBuffer<Rgba<u8>, _> =
                ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())
                    .ok_or_else(|| anyhow!("Failed to create RGBA buffer"))?;
            DynamicImage::ImageRgba8(buffer)
        }
        1 => {
            let buffer: ImageBuffer<Luma<u8>, _> =
                ImageBuffer::from_raw(width as u32, height as u32, decoded.to_vec())
                    .ok_or_else(|| anyhow!("Failed to create Luma buffer"))?;
            DynamicImage::ImageLuma8(buffer)
        }
        _ => {
            return Err(anyhow!("Unsupported JPEG components: {}", components));
        }
    };

    img = apply_orientation(img, orientation);
    Ok(img)
}

fn get_exif_orientation(data: &[u8]) -> u8 {
    let reader = Reader::new();
    let exif_reader = match reader.read_from_container(&mut Cursor::new(data)) {
        Ok(r) => r,
        Err(_) => return 1,
    };

    match exif_reader.get_field(exif::Tag::Orientation, exif::In::PRIMARY) {
        Some(field) => match field.value.get_uint(0) {
            Some(v) => v as u8,
            None => 1,
        },
        None => 1,
    }
}

fn apply_orientation(img: DynamicImage, orientation: u8) -> DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.rotate180().fliph(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}
