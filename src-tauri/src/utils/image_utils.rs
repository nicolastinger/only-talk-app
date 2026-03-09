use anyhow::{anyhow, Result};
use image::{DynamicImage, ImageReader, imageops::FilterType};
use log::info;
use std::fs::File;
use std::io::{BufReader, Write};
use std::path::Path;
use std::time::Instant;

const MAX_INPUT_SIZE: u64 = 100 * 1024 * 1024;
const MAX_OUTPUT_SIZE: u64 = 200 * 1024;
const TARGET_QUALITY: u8 = 80;
const MAX_DIMENSION: u32 = 800;

pub fn compress_image_to_webp(input_path: &Path) -> Result<File> {
    let start = Instant::now();
    
    let metadata = std::fs::metadata(input_path)?;
    info!("[压缩] 文件大小: {} bytes", metadata.len());
    
    if metadata.len() > MAX_INPUT_SIZE {
        return Err(anyhow!("输入图片大小不能超过100MB"));
    }

    info!("[压缩] 开始解码图片...");
    let decode_start = Instant::now();
    
    let file = File::open(input_path)?;
    let mut buf_reader = BufReader::new(&file);
    
    let img = ImageReader::new(&mut buf_reader)
        .with_guessed_format()?
        .decode()?;
    
    let decode_time = decode_start.elapsed();
    info!("[压缩] 解码完成，耗时: {:?}", decode_time);
    
    let (width, height) = (img.width(), img.height());
    info!("[压缩] 图片尺寸: {}x{}", width, height);

    let img_to_encode = if width > MAX_DIMENSION || height > MAX_DIMENSION {
        let scale = (MAX_DIMENSION as f64 / width.max(height) as f64).min(1.0);
        let new_width = ((width as f64 * scale) as u32).max(1);
        let new_height = ((height as f64 * scale) as u32).max(1);
        info!("[压缩] 缩放到: {}x{}", new_width, new_height);
        img.resize(new_width, new_height, FilterType::Lanczos3)
    } else {
        img
    };

    info!("[压缩] 开始编码 WebP...");
    let encode_start = Instant::now();
    
    let final_data = encode_to_webp(&img_to_encode)?;
    
    let encode_time = encode_start.elapsed();
    info!("[压缩] 编码完成，耗时: {:?}, 大小: {} bytes", encode_time, final_data.len());

    if final_data.len() > MAX_OUTPUT_SIZE as usize {
        info!("[压缩] 文件仍然过大，继续缩放...");
        let target_ratio = (MAX_OUTPUT_SIZE as f64 / final_data.len() as f64).sqrt();
        let scale = (target_ratio * 100.0).min(100.0) as u32;
        
        let new_width = ((img_to_encode.width() as f64 * scale as f64 / 100.0) as u32).max(1);
        let new_height = ((img_to_encode.height() as f64 * scale as f64 / 100.0) as u32).max(1);
        
        info!("[压缩] 继续缩放到: {}x{}", new_width, new_height);
        
        let resized = img_to_encode.resize(new_width, new_height, FilterType::Lanczos3);
        let final_data = encode_to_webp(&resized)?;
        info!("[压缩] 缩放后编码完成，大小: {} bytes", final_data.len());
        
        let output_path = input_path.with_extension("webp");
        let mut output_file = File::create(&output_path)?;
        output_file.write_all(&final_data)?;
        
        let total_time = start.elapsed();
        info!("[压缩] 总耗时: {:?}", total_time);
        
        return Ok(output_file);
    }

    let output_path = input_path.with_extension("webp");
    let mut output_file = File::create(&output_path)?;
    output_file.write_all(&final_data)?;

    let total_time = start.elapsed();
    info!("[压缩] 总耗时: {:?}", total_time);

    Ok(output_file)
}

fn encode_to_webp(img: &DynamicImage) -> Result<Vec<u8>> {
    let encoder = webp::Encoder::from_image(img).map_err(|e| anyhow!("WebP encoder error: {}", e))?;
    let webp_data = encoder.encode(TARGET_QUALITY as f32);
    Ok(webp_data.to_vec())
}
