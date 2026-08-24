import { DEFAULT_ICON } from '@/constants';
import { useIntl } from '@umijs/max';
import { getFiles } from '@workspace/services';
import { PlazaUser } from '@workspace/types';
import React, { useEffect, useMemo, useState } from 'react';
import { getGenderLabel } from './genderHelper';
import styles from './styles/PlazaCard.less';

const hashHue = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % 360;
  }
  return hash;
};

const PlazaCard = (props: { user: PlazaUser; onClick: () => void }) => {
  const { username, icon, info, gender, age, address } = props.user;
  const intl = useIntl();
  const [userIcon, setUserIcon] = useState<string | null>(null);
  const hue = useMemo(
    () => hashHue(props.user.uuid || username || ''),
    [props.user.uuid, username],
  );

  const getUserIcon = async (icon: string) => {
    try {
      if (!icon) {
        setUserIcon(null);
        return;
      }
      const FileVos = await getFiles(icon);
      setUserIcon(FileVos?.[0]?.tauri_file_path || null);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    getUserIcon(icon || '');
  }, [icon]);

  const cardStyle = { '--card-hue': hue } as React.CSSProperties;

  return (
    <div className={styles.container} style={cardStyle} onClick={props.onClick}>
      <div className={styles.cover}>
        <div className={styles.coverIcon}>
          <img
            src={userIcon || DEFAULT_ICON}
            className={styles.avatar}
            alt="avatar"
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_ICON;
            }}
          />
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.name}>{username || ''}</div>
        <div className={styles.info}>{info || ''}</div>
        <div className={styles.tags}>
          {age ? (
            <span className={styles.tag}>
              {age}
              {intl.formatMessage({ id: 'plaza.ageUnit' })}
            </span>
          ) : null}
          {gender !== undefined && gender !== null ? (
            <span className={styles.tag}>{getGenderLabel(intl, gender)}</span>
          ) : null}
          {address ? <span className={styles.tag}>{address}</span> : null}
        </div>
      </div>
    </div>
  );
};

export default PlazaCard;
