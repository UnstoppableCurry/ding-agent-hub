import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Table, Spin, Tooltip } from 'antd';
import { UserOutlined, ApartmentOutlined, DatabaseOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { statusApi } from '../api';

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    statusApi.get().then(res => { setData(res.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" />;
  if (!data) return <div>加载失败</div>;

  const serviceColumns = [
    { title: '服务', dataIndex: 'name', key: 'name' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => (
      <Tag color={s === 'running' ? 'green' : 'red'} icon={s === 'running' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>{s}</Tag>
    )},
    { title: '运行时间', dataIndex: 'uptime', key: 'uptime' },
  ];

  const services = data.services?.error
    ? [{ key: '0', name: 'Docker', status: 'error', uptime: data.services.error }]
    : Object.entries(data.services || {}).map(([name, info]: any) => ({
        key: name, name, status: info.status || 'unknown', uptime: info.uptime || '-',
      }));

  const logColumns = [
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 180 },
    { title: '目标', dataIndex: 'target', key: 'target', width: 100 },
    { title: '操作', dataIndex: 'action', key: 'action', width: 160 },
    { title: '结果', dataIndex: 'result', key: 'result', width: 80, render: (r: string) => (
      <Tag color={r === 'success' ? 'green' : 'red'}>{r}</Tag>
    )},
    { title: '详情', dataIndex: 'error_message', key: 'error_message', ellipsis: true },
    { title: 'Payload', dataIndex: 'payload', key: 'payload', width: 120, ellipsis: true, render: (v: any) => {
      if (!v) return '-';
      const text = typeof v === 'string' ? v : JSON.stringify(v);
      return <Tooltip title={<pre style={{ maxHeight: 300, overflow: 'auto', margin: 0, fontSize: 12 }}>{JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2)}</pre>} overlayStyle={{ maxWidth: 500 }}><span style={{ cursor: 'pointer' }}>{text.slice(0, 30)}{text.length > 30 ? '...' : ''}</span></Tooltip>;
    }},
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="总用户数" value={data.stats?.totalUsers} prefix={<UserOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="活跃用户" value={data.stats?.activeUsers} prefix={<UserOutlined />} valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="部门" value={data.stats?.departments} prefix={<ApartmentOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="知识库" value={data.stats?.workspaces} prefix={<DatabaseOutlined />} /></Card></Col>
      </Row>

      <Card title="服务状态" style={{ marginBottom: 24 }}>
        <Table columns={serviceColumns} dataSource={services} pagination={false} size="small" />
      </Card>

      <Card title="最近同步日志">
        <Table
          columns={logColumns}
          dataSource={data.recentLogs?.map((l: any) => ({ ...l, key: l.id }))}
          pagination={false}
          size="small"
          rowClassName={(record: any) => record.result === 'error' ? 'row-error' : ''}
        />
        <style>{`.row-error { background-color: #fff2f0 !important; } .row-error td { background-color: #fff2f0 !important; }`}</style>
      </Card>
    </div>
  );
}
