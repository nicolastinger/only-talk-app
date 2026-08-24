import { useBearStore } from '@/store/store';
import { RadarChartOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import {
  get_plaza_profile,
  update_plaza_profile,
  update_plaza_tags,
} from '@workspace/services';
import {
  Button,
  Card,
  Divider,
  Input,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import styles from '../Settings.less';

const { Title, Text } = Typography;
const { TextArea } = Input;

const MAX_TAGS = 100;
const MAX_TAG_LEN = 32;

const PlazaSettings = () => {
  const intl = useIntl();
  const triggerRefresh = useBearStore((state) => state.triggerRefresh);
  const [allowDiscover, setAllowDiscover] = useState(false);
  const [motto, setMotto] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [switchLoading, setSwitchLoading] = useState(false);
  const [mottoLoading, setMottoLoading] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const profile = await get_plaza_profile();
      setAllowDiscover(!!profile.allow_discover);
      setMotto(profile.motto || '');
      setTags(profile.tags || []);
    } catch (error) {
      console.error('获取广场设置失败', error);
      message.error(
        intl.formatMessage({ id: 'settings.plazaSettings.loadFailed' }),
      );
    }
  };

  const handleAllowDiscoverChange = async (checked: boolean) => {
    const prev = allowDiscover;
    setAllowDiscover(checked);
    setSwitchLoading(true);
    try {
      await update_plaza_profile({ allow_discover: checked });
      triggerRefresh();
    } catch (error) {
      console.error('更新被发现开关失败', error);
      setAllowDiscover(prev);
      message.error(
        intl.formatMessage({ id: 'settings.plazaSettings.updateFailed' }),
      );
    } finally {
      setSwitchLoading(false);
    }
  };

  const handleSaveMotto = async () => {
    setMottoLoading(true);
    try {
      await update_plaza_profile({ motto });
      triggerRefresh();
      message.success(
        intl.formatMessage({ id: 'settings.plazaSettings.saved' }),
      );
    } catch (error) {
      console.error('保存交友宣言失败', error);
      message.error(
        intl.formatMessage({ id: 'settings.plazaSettings.updateFailed' }),
      );
    } finally {
      setMottoLoading(false);
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (!tag || tag.length > MAX_TAG_LEN) return;
    if (tags.includes(tag)) {
      setTagInput('');
      return;
    }
    if (tags.length >= MAX_TAGS) {
      message.warning(
        intl.formatMessage({ id: 'settings.plazaSettings.tagLimit' }),
      );
      return;
    }
    setTags((prev) => [...prev, tag]);
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSaveTags = async () => {
    setTagsLoading(true);
    try {
      await update_plaza_tags({ tags });
      triggerRefresh();
      message.success(
        intl.formatMessage({ id: 'settings.plazaSettings.saved' }),
      );
    } catch (error) {
      console.error('保存标签失败', error);
      message.error(
        intl.formatMessage({ id: 'settings.plazaSettings.updateFailed' }),
      );
    } finally {
      setTagsLoading(false);
    }
  };

  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.plazaSettings.title' })}
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <RadarChartOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.plazaSettings.allowDiscover' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Switch
          checked={allowDiscover}
          loading={switchLoading}
          onChange={handleAllowDiscoverChange}
          className={styles.settingSwitch}
        />
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({
            id: 'settings.plazaSettings.allowDiscoverDesc',
          })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <RadarChartOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.plazaSettings.motto' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <TextArea
          value={motto}
          onChange={(e) => setMotto(e.target.value)}
          placeholder={intl.formatMessage({
            id: 'settings.plazaSettings.mottoPlaceholder',
          })}
          maxLength={255}
          rows={3}
          showCount
          className={styles.textArea}
        />
        <div className={styles.buttonGroup}>
          <Button
            type="primary"
            loading={mottoLoading}
            onClick={handleSaveMotto}
          >
            {intl.formatMessage({ id: 'settings.plazaSettings.mottoSave' })}
          </Button>
        </div>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <RadarChartOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.plazaSettings.tags' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <div className={styles.tagEditor}>
          {tags.map((tag) => (
            <Tag
              key={tag}
              closable
              onClose={(e) => {
                e.preventDefault();
                handleRemoveTag(tag);
              }}
            >
              {tag}
            </Tag>
          ))}
          {tags.length === 0 && (
            <Text type="secondary">
              {intl.formatMessage({ id: 'settings.plazaSettings.tagEmpty' })}
            </Text>
          )}
        </div>
        <div className={styles.buttonGroup}>
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onPressEnter={handleAddTag}
            placeholder={intl.formatMessage({
              id: 'settings.plazaSettings.tagAddPlaceholder',
            })}
            maxLength={MAX_TAG_LEN}
            className={styles.tagInput}
          />
          <Button onClick={handleAddTag}>
            {intl.formatMessage({ id: 'settings.plazaSettings.tagAdd' })}
          </Button>
          <Button type="primary" loading={tagsLoading} onClick={handleSaveTags}>
            {intl.formatMessage({ id: 'settings.plazaSettings.tagSave' })}
          </Button>
        </div>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.plazaSettings.tagDesc' })}
        </Text>
      </Card>
    </div>
  );
};

export default PlazaSettings;
