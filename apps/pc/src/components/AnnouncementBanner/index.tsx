import { SoundOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { useEffect, useState } from 'react';
import { get_announcement_list } from '@workspace/services';
import { AnnouncementVO } from '@workspace/types';
import AnnouncementModal from '@/components/AnnouncementModal';
import { useAnnouncementStore } from '@/store/announcement';
import styles from './index.less';

const AnnouncementBanner = () => {
  const intl = useIntl();
  const ignored = useAnnouncementStore((state) => state.ignored);
  const [list, setList] = useState<AnnouncementVO[]>([]);
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState<AnnouncementVO | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchList = async () => {
    try {
      const res = await get_announcement_list(1, 20);
      setList(res.list || []);
    } catch (e) {
      console.log('获取公告列表失败', e);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  // 过滤掉没有标题且没有内容的空公告，以及已忽略的公告
  const visibleList = list.filter(
    (item) => (item.title || item.content) && !ignored.includes(item.uuid),
  );

  // 多条时定时轮播切换
  useEffect(() => {
    if (visibleList.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % visibleList.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [visibleList.length]);

  if (visibleList.length === 0) return null;

  const current = visibleList[index % visibleList.length];

  return (
    <>
      <div className={styles.banner}>
        <div className={styles.label}>
          <SoundOutlined className={styles.icon} />
          <span>{intl.formatMessage({ id: 'announcement.banner' })}</span>
        </div>
        <div
          className={styles.title}
          key={current.uuid}
          onClick={() => {
            setActive(current);
            setModalVisible(true);
          }}
        >
          {current.title}
        </div>
      </div>
      <AnnouncementModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        announcement={active}
      />
    </>
  );
};

export default AnnouncementBanner;
