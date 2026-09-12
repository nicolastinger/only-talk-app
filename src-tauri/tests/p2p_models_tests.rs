#![cfg(test)]

//! P2P 媒体帧头(MediaFrameHeader)字节布局与 P2P 结构体序列化单元测试。
//!
//! 帧头布局固定 5 字节: [frame_type: u8][data_len: u32(大端序)]，
//! 与 quic_service 媒体通道协议强相关，改动前必须保证此测试通过。

use app_lib::entity::p2p_models::{
    MediaFrameHeader, MediaFrameType, P2pAudioConfig, P2pBufferConfig, P2pChannelType,
    P2pFileTransferRequest, P2pInitMsg, P2pMediaConfig, P2pMediaInfo, P2pMediaInfoType,
    P2pVideoConfig,
};

#[test]
fn media_frame_type_try_from() {
    assert_eq!(MediaFrameType::try_from(1).expect("1 应为 Video"), MediaFrameType::Video);
    assert_eq!(MediaFrameType::try_from(2).expect("2 应为 Audio"), MediaFrameType::Audio);
    assert!(MediaFrameType::try_from(0).is_err());
    assert!(MediaFrameType::try_from(3).is_err());
}

#[test]
fn media_frame_header_to_bytes_layout() {
    let header = MediaFrameHeader::new(MediaFrameType::Video, 0x01020304);
    let bytes = header.to_bytes();
    assert_eq!(bytes.len(), 5);
    assert_eq!(bytes[0], 1, "Video 帧类型字节应为 1");
    assert_eq!(&bytes[1..5], &[0x01, 0x02, 0x03, 0x04], "data_len 应为大端序");
}

#[test]
fn media_frame_header_audio_layout() {
    let header = MediaFrameHeader::new(MediaFrameType::Audio, 42);
    let bytes = header.to_bytes();
    assert_eq!(bytes[0], 2, "Audio 帧类型字节应为 2");
    assert_eq!(&bytes[1..5], &42u32.to_be_bytes());
}

#[test]
fn media_frame_header_roundtrip() {
    for ft in [MediaFrameType::Video, MediaFrameType::Audio] {
        for len in [0u32, 1, 123_456, u32::MAX] {
            let header = MediaFrameHeader::new(ft, len);
            let back =
                MediaFrameHeader::from_bytes(&header.to_bytes()).expect("反序列化失败");
            assert_eq!(back.frame_type, ft);
            assert_eq!(back.data_len, len);
        }
    }
}

#[test]
fn media_frame_header_rejects_unknown_frame_type() {
    let bytes = [99u8, 0, 0, 0, 0];
    assert!(MediaFrameHeader::from_bytes(&bytes).is_err());
}

#[test]
fn media_frame_header_write_to_matches_to_bytes() {
    let header = MediaFrameHeader::new(MediaFrameType::Audio, 0xDEADBEEF);
    let mut buf = [0u8; 5];
    header.write_to(&mut buf);
    assert_eq!(buf, header.to_bytes());
}

#[test]
fn media_frame_build_frame() {
    let data = vec![0xAA, 0xBB, 0xCC, 0xDD];
    let frame = MediaFrameHeader::build_frame(MediaFrameType::Video, &data);
    assert_eq!(frame.len(), 5 + data.len());
    assert_eq!(frame[0], 1);
    assert_eq!(&frame[1..5], &(data.len() as u32).to_be_bytes());
    assert_eq!(&frame[5..], data.as_slice());

    let header_bytes: [u8; 5] = frame[..5].try_into().expect("前 5 字节应为帧头");
    let header = MediaFrameHeader::from_bytes(&header_bytes).expect("解析帧头失败");
    assert_eq!(header.data_len, data.len() as u32);
}

#[test]
fn p2p_channel_type_display() {
    assert_eq!(P2pChannelType::Default.to_string(), "default");
    assert_eq!(P2pChannelType::MediaInfo.to_string(), "media_info");
    assert_eq!(P2pChannelType::MediaData.to_string(), "media_data");
    assert_eq!(P2pChannelType::File.to_string(), "file");
}

#[test]
fn p2p_media_config_defaults() {
    let cfg = P2pMediaConfig::default();
    assert_eq!(cfg.video_config.width, 640);
    assert_eq!(cfg.video_config.height, 480);
    assert_eq!(cfg.video_config.fps, 15);
    assert_eq!(cfg.audio_config.sample_rate, 48000);
    assert_eq!(cfg.audio_config.bitrate, 32_000);
    assert_eq!(cfg.buffer_config.video_buffer_size, 5);
    assert_eq!(cfg.buffer_config.max_latency_ms, 200);
    assert!(cfg.buffer_config.adaptive_buffer);
}

#[test]
fn p2p_video_config_serde_roundtrip() {
    let cfg = P2pVideoConfig::default();
    let json = serde_json::to_string(&cfg).expect("序列化失败");
    let back: P2pVideoConfig = serde_json::from_str(&json).expect("反序列化失败");
    assert_eq!(back.encode, cfg.encode);
    assert_eq!(back.bitrate, cfg.bitrate);
    assert!(back.video);
    assert!(back.audio);
}

#[test]
fn p2p_audio_config_serde_roundtrip() {
    let cfg = P2pAudioConfig::default();
    let json = serde_json::to_string(&cfg).expect("序列化失败");
    let back: P2pAudioConfig = serde_json::from_str(&json).expect("反序列化失败");
    assert_eq!(back.sample_rate, cfg.sample_rate);
    assert!(back.echo_cancellation);
    assert!(back.noise_suppression);
}

#[test]
fn p2p_buffer_config_defaults_serde() {
    let cfg = P2pBufferConfig::default();
    assert_eq!(cfg.max_latency_ms, 200);
    let json = serde_json::to_string(&cfg).expect("序列化失败");
    let back: P2pBufferConfig = serde_json::from_str(&json).expect("反序列化失败");
    assert_eq!(back.video_buffer_size, cfg.video_buffer_size);
    assert_eq!(back.audio_buffer_size, cfg.audio_buffer_size);
    assert_eq!(back.adaptive_buffer, cfg.adaptive_buffer);
    assert_eq!(back.max_latency_ms, cfg.max_latency_ms);
}

#[test]
fn p2p_init_msg_serde_roundtrip() {
    let msg = P2pInitMsg {
        accept_addr: "1.2.3.4:1234".to_string(),
        request_addr: "5.6.7.8:4321".to_string(),
        request_uuid: "u1".to_string(),
        request_token: "t".to_string(),
        accept_uuid: "u2".to_string(),
        accept: true,
        ip_type: 1,
        step: 2,
        is_server: true,
    };
    let json = serde_json::to_string(&msg).expect("序列化失败");
    let back: P2pInitMsg = serde_json::from_str(&json).expect("反序列化失败");
    assert_eq!(back.request_uuid, "u1");
    assert_eq!(back.accept_uuid, "u2");
    assert!(back.accept);
    assert_eq!(back.ip_type, 1);
    assert_eq!(back.step, 2);
    assert!(back.is_server);
}

#[test]
fn p2p_file_transfer_request_serde_roundtrip() {
    let msg = P2pFileTransferRequest {
        file_name: "a.zip".to_string(),
        mime_type: "application/zip".to_string(),
        total_size: 10_240,
        total_chunks: 10,
        transfer_id: "tid".to_string(),
        timestamp: 123,
    };
    let json = serde_json::to_string(&msg).expect("序列化失败");
    let back: P2pFileTransferRequest = serde_json::from_str(&json).expect("反序列化失败");
    assert_eq!(back.file_name, "a.zip");
    assert_eq!(back.total_chunks, 10);
    assert_eq!(back.total_size, 10_240);
}

#[test]
fn p2p_media_info_serde_roundtrip() {
    let info = P2pMediaInfo {
        info_type: P2pMediaInfoType::BitrateChange,
        data: r#"{"bitrate":500000}"#.to_string(),
        timestamp: 999,
    };
    let json = serde_json::to_string(&info).expect("序列化失败");
    let back: P2pMediaInfo = serde_json::from_str(&json).expect("反序列化失败");
    assert_eq!(format!("{:?}", back.info_type), "BitrateChange");
    assert_eq!(back.timestamp, 999);
}