import { TALK_API } from '@workspace/types';
import { convertPathToTauriUrl, create_moment, selectFile } from '@workspace/services';
import { invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import { Button, Input, Modal, Segmented, message } from 'antd';
import { useEffect, useState } from 'react';
import styles from './styles/MomentComposer.less';

const MomentComposer = (props: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { open, onClose, onSuccess } = props;
  const intl = useIntl();
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<number>(0);
  const [images, setImages] = useState<string[]>([]);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setContent('');
      setVisibility(0);
      setImages([]);
      setFileIds([]);
    }
  }, [open]);

  const handleSelect = async () => {
    const files = await selectFile(true);
    if (!files || files.length === 0) return;
    // selectFile 对多选返回嵌套数组 [[path...]], 扁平化一层
    const picked = files.flat();
    setUploading(true);
    try {
      for (const fp of picked) {
        const compressed = await invoke<string>('compress_image_to_webp_command', {
          inputPath: fp,
        });
        const preview = convertPathToTauriUrl(compressed);
        const res = await invoke<{ status: number; body: string }>(
          'upload_file_request',
          {
            url: `${TALK_API}/file_integrated/upload/moment`,
            filePath: compressed,
            fieldName: 'file',
          }
        );
        if (res.status === 200) {
          const json = JSON.parse(res.body);
          if (json.code === 200 && json.data) {
            if (preview) setImages((prev) => [...prev, preview]);
            setFileIds((prev) => [...prev, json.data]);
          } else {
            message.error(json.message || '上传失败');
          }
        } else {
          message.error('上传失败');
        }
      }
    } catch (e) {
      console.error('上传动态图片失败:', e);
      message.error('上传动态图片失败');
    } finally {
      setUploading(false);
    }
  };

  const handlePublish = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      message.warning(intl.formatMessage({ id: 'moments.composer.contentEmpty' }));
      return;
    }
    setLoading(true);
    try {
      const created = await create_moment({
        content: trimmed,
        visibility,
        file_ids: fileIds,
      });
      if (created) {
        message.success(intl.formatMessage({ id: 'moments.composer.publishSuccess' }));
        onClose();
        onSuccess();
      }
    } catch (e) {
      console.error('发布动态失败:', e);
      message.error(e.message || '发布动态失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={intl.formatMessage({ id: 'moments.composer.title' })}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {intl.formatMessage({ id: 'moments.composer.cancel' })}
        </Button>,
        <Button
          key="publish"
          type="primary"
          loading={loading}
          onClick={handlePublish}
        >
          {intl.formatMessage({ id: 'moments.composer.publish' })}
        </Button>,
      ]}
      centered
    >
      <div className={styles.composer}>
        <Input.TextArea
          rows={4}
          value={content}
          maxLength={2000}
          placeholder={intl.formatMessage({ id: 'moments.composer.placeholder' })}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className={styles.visibilityRow}>
          <span className={styles.label}>
            {intl.formatMessage({ id: 'moments.composer.visibility' })}
          </span>
          <Segmented
            value={visibility}
            onChange={(v) => setVisibility(Number(v))}
            options={[
              { label: intl.formatMessage({ id: 'moments.composer.public' }), value: 0 },
              { label: intl.formatMessage({ id: 'moments.composer.self' }), value: 1 },
            ]}
          />
        </div>
        <div className={styles.imageArea}>
          <button
            className={styles.addBtn}
            disabled={uploading}
            onClick={handleSelect}
          >
            {uploading
              ? intl.formatMessage({ id: 'moments.composer.uploading' })
              : intl.formatMessage({ id: 'moments.composer.addImage' })}
          </button>
          {images.length > 0 && (
            <div className={styles.previewGrid}>
              {images.map((img, i) => (
                <div key={i} className={styles.previewItem}>
                  <img src={img} alt="" className={styles.previewImg} />
                  <button
                    className={styles.removeBtn}
                    onClick={() => {
                      setImages((prev) => prev.filter((_, idx) => idx !== i));
                      setFileIds((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default MomentComposer;
