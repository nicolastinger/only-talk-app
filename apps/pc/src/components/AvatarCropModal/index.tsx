import { useIntl } from '@umijs/max';
import { Button, Modal, Slider } from 'antd';
import React, { useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import styles from './index.less';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AvatarCropModalProps {
  open: boolean;
  src: string;
  onCancel: () => void;
  onConfirm: (rect: CropRect) => Promise<void> | void;
}

const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  open,
  src,
  onCancel,
  onConfirm,
}) => {
  const intl = useIntl();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (!croppedArea) return;
    setConfirming(true);
    try {
      await onConfirm({
        x: Math.round(croppedArea.x),
        y: Math.round(croppedArea.y),
        width: Math.round(croppedArea.width),
        height: Math.round(croppedArea.height),
      });
    } finally {
      setConfirming(false);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      width={420}
      centered
      footer={null}
      maskClosable={false}
      destroyOnClose
      title={intl.formatMessage({ id: 'avatarCrop.title' })}
    >
      <div className={styles.cropContainer}>
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={1}
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, area) => setCroppedArea(area)}
        />
      </div>
      <div className={styles.zoomControl}>
        <span className={styles.zoomLabel}>
          {intl.formatMessage({ id: 'avatarCrop.zoom' })}
        </span>
        <Slider
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={setZoom}
          className={styles.zoomSlider}
        />
      </div>
      <div className={styles.footer}>
        <Button onClick={onCancel}>
          {intl.formatMessage({ id: 'avatarCrop.cancel' })}
        </Button>
        <Button type="primary" onClick={handleConfirm} loading={confirming}>
          {intl.formatMessage({ id: 'avatarCrop.confirm' })}
        </Button>
      </div>
    </Modal>
  );
};

export default AvatarCropModal;