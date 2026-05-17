import { useLocation } from '@@/exports';
import { useEffect } from 'react';
import FriendInfo from './components/FriendInfo';
import styles from './index.less';

const ContactsPage = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const friendUuid = params.get('friendId') || '';
  useEffect(() => {
    console.log('friendUuid', friendUuid);
  }, [friendUuid]);

  return (
    <div className={styles.container}>
      <FriendInfo uuid={friendUuid} />
    </div>
  );
};

export default ContactsPage;
