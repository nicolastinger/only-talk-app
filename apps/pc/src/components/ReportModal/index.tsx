import { useIntl } from '@umijs/max';
import { submit_report } from '@workspace/services';
import type { ReportTargetTypeValue } from '@workspace/types';
import { Input, message, Modal } from 'antd';
import { useEffect, useState } from 'react';
import styles from './index.less';

const ReportModal = (props: {
  open: boolean;
  targetType: ReportTargetTypeValue;
  targetUuid: string;
  targetName?: string;
  onClose: () => void;
}) => {
  const { open, targetType, targetUuid, targetName, onClose } = props;
  const intl = useIntl();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    const text = reason.trim();
    if (!text) {
      message.warning(intl.formatMessage({ id: 'report.reasonRequired' }));
      return;
    }
    setSubmitting(true);
    try {
      await submit_report({
        target_type: targetType,
        target_uuid: targetUuid,
        reason: text,
      });
      message.success(intl.formatMessage({ id: 'report.success' }));
      onClose();
    } catch (e) {
      message.error(
        (e as Error).message || intl.formatMessage({ id: 'report.failed' }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={intl.formatMessage({ id: 'report.title' })}
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText={intl.formatMessage({ id: 'report.submit' })}
      cancelText={intl.formatMessage({ id: 'report.cancel' })}
      confirmLoading={submitting}
      okButtonProps={{ danger: true }}
      className={styles.modal}
    >
      <div className={styles.tip}>
        {targetName
          ? intl.formatMessage({ id: 'report.targetTip' }, { name: targetName })
          : intl.formatMessage({ id: 'report.tip' })}
      </div>
      <Input.TextArea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        maxLength={500}
        showCount
        placeholder={intl.formatMessage({ id: 'report.placeholder' })}
      />
    </Modal>
  );
};

export default ReportModal;
