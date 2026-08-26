import { useIntl } from '@umijs/max';
import { Button, Segmented, Select, Tag } from 'antd';
import styles from './styles/PlazaFilter.less';

export interface PlazaFilterState {
  gender?: number;
  age_min?: number;
  age_max?: number;
  tag?: string;
}

const GENDER_OPTIONS = [
  { label: 'filterAll', value: 'all' },
  { label: 'male', value: 'male' },
  { label: 'female', value: 'female' },
] as const;

const AGE_OPTIONS: {
  label: string;
  value: string;
  min?: number;
  max?: number;
}[] = [
  { label: '18-25', value: '18_25', min: 18, max: 25 },
  { label: '26-35', value: '26_35', min: 26, max: 35 },
  { label: '36+', value: '36plus', min: 36 },
];

const PlazaFilter = (props: {
  value: PlazaFilterState;
  onChange: (value: PlazaFilterState) => void;
}) => {
  const { value, onChange } = props;
  const intl = useIntl();

  const genderValue =
    value.gender === 2 ? 'male' : value.gender === 3 ? 'female' : 'all';

  const ageValue =
    value.age_min != null
      ? value.age_min >= 36
        ? '36plus'
        : value.age_min >= 26
        ? '26_35'
        : '18_25'
      : 'all';

  const handleGender = (label: string) => {
    const gender = label === 'male' ? 2 : label === 'female' ? 3 : undefined;
    onChange({ ...value, gender });
  };

  const handleAge = (label: string) => {
    if (label === 'all') {
      onChange({ ...value, age_min: undefined, age_max: undefined });
      return;
    }
    const opt = AGE_OPTIONS.find((o) => o.value === label);
    onChange({ ...value, age_min: opt?.min, age_max: opt?.max });
  };

  const clearTag = () => onChange({ ...value, tag: undefined });

  return (
    <div className={styles.filter}>
      <div className={styles.row}>
        <span className={styles.label}>
          {intl.formatMessage({ id: 'plaza.gender' })}
        </span>
        <Segmented
          size="small"
          value={genderValue}
          options={GENDER_OPTIONS.map((o) => ({
            label: intl.formatMessage({ id: `plaza.${o.label}` }),
            value: o.value,
          }))}
          onChange={(v) => handleGender(v as string)}
        />
        <span className={styles.label}>
          {intl.formatMessage({ id: 'plaza.ageRange' })}
        </span>
        <Select
          size="small"
          style={{ width: 120 }}
          value={ageValue}
          options={[
            {
              label: intl.formatMessage({ id: 'plaza.filterAll' }),
              value: 'all',
            },
            ...AGE_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
          ]}
          onChange={handleAge}
        />
      </div>

      {value.tag ? (
        <div className={styles.row}>
          <span className={styles.label}>
            {intl.formatMessage({ id: 'plaza.tagFilterTitle' })}
          </span>
          <Tag closable className={styles.tag} onClose={clearTag}>
            #{value.tag}
          </Tag>
          <Button size="small" type="link" onClick={clearTag}>
            {intl.formatMessage({ id: 'plaza.clearFilter' })}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default PlazaFilter;
