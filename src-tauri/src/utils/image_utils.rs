use anyhow::{anyhow, Result};
use image::{DynamicImage, ImageReader};
use std::fs::File;
use std::io::{BufReader, Write};
use std::path::Path;

const MAX_INPUT_SIZE: u64 = 100 * 1024 * 1024;
const MAX_OUTPUT_SIZE: u64 = 200 * 1024;
const TARGET_QUALITY: u8 = 80;

pub fn compress_image_to_webp(input_path: &Path) -> Result<File> {
    let metadata = std::fs::metadata(input_path)?;
    if metadata.len() > MAX_INPUT_SIZE {
        return Err(anyhow!("输入图片大小不能超过100MB"));
    }

    let file = File::open(input_path)?;
    let mut buf_reader = BufReader::new(&file);
    
    let img = ImageReader::new(&mut buf_reader)
        .with_guessed_format()?
        .decode()?;

    let (width, height) = (img.width(), img.height());

    let mut final_data = encode_to_webp(&img, width, height)?;

    if final_data.len() > MAX_OUTPUT_SIZE as usize {
        let scale = ((MAX_OUTPUT_SIZE as f64 / final_data.len() as f64).sqrt() * 100.0) as u32;
        let new_width = ((width as f64 * scale as f64 / 100.0) as u32).max(1);
        let new_height = ((height as f64 * scale as f64 / 100.0) as u32).max(1);
        
        let resized = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);
        final_data = encode_to_webp(&resized, new_width, new_height)?;
    }

    let output_path = input_path.with_extension("webp");
    let mut output_file = File::create(&output_path)?;
    output_file.write_all(&final_data)?;

    Ok(output_file)
}

fn encode_to_webp(img: &DynamicImage, _width: u32, _height: u32) -> Result<Vec<u8>> {
    let mut quality = TARGET_QUALITY;

    loop {
        let encoder = webp::Encoder::from_image(img).map_err(|e| anyhow!("WebP encoder error: {}", e))?;
        let webp_data = encoder.encode(quality as f32);
        let data_vec = webp_data.to_vec();

        if data_vec.len() <= MAX_OUTPUT_SIZE as usize || quality <= 10 {
            return Ok(data_vec);
        }

        quality = quality.saturating_sub(10);
    }
}
