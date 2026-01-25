import React, { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import { useIntl } from '@umijs/max';
import { UserOutlined, LockOutlined, SmileOutlined } from '@ant-design/icons';
import { BasicUser } from '@workspace/types';
import { sign_up } from '@/services/userService';

const FastSignUp: React.FC = () => {
  const [form] = Form.useForm();
  const intl = useIntl();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: any) => {
    setLoading(true);

    let useInfo: BasicUser = {
      account: values.account,
      username: values.nickname,
      password: values.password,
    };
    let res = await sign_up(useInfo)
    console.log(res);
    if (res.netSuccess && res.res.status === 200) {
      message.success("注册成功");
    } else {
      message.error("注册失败");
    }
    setLoading(false);
  };

  return (
    <Form
      form={form}
      name="fast_sign_up"
      onFinish={onFinish}
      autoComplete="off"
      layout="vertical"
    >
      <Form.Item
        name="account"
        label={intl.formatMessage({ id: 'signUp.account' })}
        rules={[
          {
            required: true,
            message: intl.formatMessage({ id: 'signUp.accountRequired' }),
          },
          {
            pattern: /^[a-zA-Z0-9]+$/,
            message: intl.formatMessage({ id: 'signUp.accountPattern' }),
          },
          {
            min: 8,
            message: intl.formatMessage({ id: 'signUp.accountMinLength' }),
          },
        ]}
      >
        <Input
          prefix={<UserOutlined />}
          placeholder={intl.formatMessage({ id: 'signUp.accountPlaceholder' })}
        />
      </Form.Item>

      <Form.Item
        name="nickname"
        label={intl.formatMessage({ id: 'signUp.nickname' })}
        rules={[
          {
            required: true,
            message: intl.formatMessage({ id: 'signUp.nicknameRequired' }),
          },
          {
            max: 8,
            message: intl.formatMessage({ id: 'signUp.nicknameMaxLength' }),
          },
          {
            pattern: /^[a-zA-Z0-9\u4e00-\u9fa5#_@!]*$/,
            message: intl.formatMessage({ id: 'signUp.nicknamePattern' }),
          },
        ]}
      >
        <Input
          prefix={<SmileOutlined />}
          placeholder={intl.formatMessage({ id: 'signUp.nicknamePlaceholder' })}
        />
      </Form.Item>

      <Form.Item
        name="password"
        label={intl.formatMessage({ id: 'signUp.password' })}
        rules={[
          {
            required: true,
            message: intl.formatMessage({ id: 'signUp.passwordRequired' }),
          },
          {
            pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]+$/,
            message: intl.formatMessage({ id: 'signUp.passwordPattern' }),
          },
          {
            min: 13,
            message: intl.formatMessage({ id: 'signUp.passwordMinLength' }),
          },
        ]}
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder={intl.formatMessage({ id: 'signUp.passwordPlaceholder' })}
        />
      </Form.Item>

      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          {intl.formatMessage({ id: 'signUp.submit' })}
        </Button>
      </Form.Item>
    </Form>
  );
};

export default FastSignUp;