import { DEFAULT_ICON } from '@/constants';
import { useIntl } from '@umijs/max';
import { getFiles } from '@workspace/services';
import { PlazaUser } from '@workspace/types';
import React, { useEffect, useMemo, useState } from 'react';
import { getGenderLabel } from './genderHelper';
import styles from './styles/PlazaCard.less';

const MAX_TAGS_SHOWN = 3;

const hashHue = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % 360;
  }
  return hash;
};

const PlazaCard = (props: { user: PlazaUser; onClick: () => void }) => {
  const { username, icon, info, gender, age, address, motto, tags } =
    props.user;
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

  const genderClass =
    gender === 2 ? styles.male : gender === 3 ? styles.female : '';

  const shownTags = (tags || []).slice(0, MAX_TAGS_SHOWN);
  const restCount = (tags || []).length - shownTags.length;

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

        <div className={styles.meta}>
          {gender !== undefined && gender !== null ? (
            <span className={`${styles.gender} ${genderClass}`}>
              {getGenderLabel(intl, gender)}
            </span>
          ) : null}
          {age ? (
            <span className={styles.metaText}>
              {age}
              {intl.formatMessage({ id: 'plaza.ageUnit' })}
            </span>
          ) : null}
          {address ? <span className={styles.metaText}>{address}</span> : null}
        </div>

        {(motto || info) && <div className={styles.motto}>{motto || info}</div>}

        {shownTags.length > 0 && (
          <div className={styles.tags}>
            {shownTags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
            {restCount > 0 && (
              <span className={styles.tagMore}>+{restCount}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlazaCard;
