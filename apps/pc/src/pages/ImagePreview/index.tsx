import ImagePreview from '@/components/ImagePreview';
import { useLocation, useNavigate } from '@umijs/max';
import { useEffect, useState } from 'react';
import styles from './index.less';

const ImagePreviewPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    const imagesParam = params.get('images');
    const indexParam = params.get('index');

    console.log('Raw images param:', imagesParam);

    if (imagesParam && imagesParam.length > 0) {
      try {
        let decodedParam = imagesParam;
        while (/%25[0-9A-F]{2}/i.test(decodedParam)) {
          decodedParam = decodeURIComponent(decodedParam);
        }
        const paths = JSON.parse(decodedParam);
        console.log('Parsed image paths:', paths);
        setImagePaths(paths);
        if (indexParam) {
          setCurrentIndex(parseInt(indexParam, 10));
        }
      } catch (error) {
        console.error('Failed to parse image paths:', error);
      }
    }
  }, [location.search]);

  const handleClose = () => {
    navigate(-1);
  };

  if (imagePaths.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <ImagePreview
        imagePaths={imagePaths}
        currentIndex={currentIndex}
        onClose={handleClose}
      />
    </div>
  );
};

export default ImagePreviewPage;
