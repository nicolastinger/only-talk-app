import { useState } from 'react';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import styles from './CamouflageButton.less';

const CamouflageButton = () => {
  const [isCamouflaged, setIsCamouflaged] = useState(false);

  const toggleCamouflage = () => {
    setIsCamouflaged(!isCamouflaged);
  };

  return (
    <Tooltip title={isCamouflaged ? "取消伪装" : "伪装"} placement="bottom">
      <div 
        className={`${styles.camouflageButton} ${isCamouflaged ? styles.camouflaged : ''}`} 
        onClick={toggleCamouflage}
      >
        {isCamouflaged ? <EyeInvisibleOutlined /> : <EyeOutlined />}
      </div>
    </Tooltip>
  );
};

export default CamouflageButton;
