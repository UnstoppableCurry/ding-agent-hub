import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Tag, Upload, Popconfirm, Switch } from 'antd';
import { PlusOutlined, UploadOutlined, SyncOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { usersApi, departmentsApi } from '../api';
import * as XLSX from 'xlsx';

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [importData, setImportData] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [form] = Form.useForm();

  const fetchUsers = async (p = page, s = search) => {
    setLoading(true);
    try {
      const { data } = await usersApi.list({ page: p, pageSize: 20, search: s || undefined });
      setUsers(data.data);
      setTotal(data.total);
    } finally { setLoading(false); }
  };

  const fetchDepts = async () => {
    const { data } = await departmentsApi.list();
    setDepartments(data.data);
  };

  useEffect(() => { fetchUsers(); fetchDepts(); }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editingUser) {
        await usersApi.update(editingUser.id, values);
        message.success('更新成功');
      } else {
        await usersApi.create(values);
        message.success('创建成功');
      }
      setModalOpen(false);
      form.resetFields();
      setEditingUser(null);
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    await usersApi.delete(id);
    message.success('已删除');
    fetchUsers();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await usersApi.sync();
      setSyncResult(data);
      message.success(`同步完成: ${data?.agents?.agentCount ?? 0} 个 Agent 已同步`);
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.error || '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleActive = async (record: any) => {
    try {
      const newActive = record.is_active ? 0 : 1;
      await usersApi.update(record.id, { ...record, is_active: newActive, department_id: record.department_id });
      if (newActive) {
        message.success(`${record.name} 已启用，已同步到OpenClaw`);
      } else {
        message.warning(`${record.name} 已停用，已从OpenClaw移除`);
      }
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleBatchUpdate = async (is_active: number) => {
    try {
      await usersApi.batchUpdate(selectedRowKeys, is_active);
      message.success(`批量${is_active ? '启用' : '停用'}成功 (${selectedRowKeys.length} 人)`);
      setSelectedRowKeys([]);
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.error || '批量操作失败');
    }
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet);
        const parsed = rows.map(r => ({
          name: r['姓名'] || r['name'] || '',
          dingtalk_id: String(r['钉钉ID'] || r['dingtalk_id'] || ''),
          department: r['部门'] || r['department'] || '',
          role: r['角色'] || r['role'] || 'member',
        }));
        setImportData(parsed);
        setImportModalOpen(true);
      } catch { message.error('文件解析失败'); }
    };
    reader.readAsBinaryString(file);
    return false;
  };

  const handleImportConfirm = async () => {
    try {
      const { data } = await usersApi.import(importData);
      message.success(`导入 ${data.imported} 人，跳过 ${data.skipped} 人`);
      setImportModalOpen(false);
      setImportData([]);
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.error || '导入失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '姓名', dataIndex: 'name' },
    { title: '钉钉ID', dataIndex: 'dingtalk_id', ellipsis: true },
    { title: '部门', dataIndex: 'department_name', render: (v: string) => v || '-' },
    { title: '角色', dataIndex: 'role', render: (r: string) => {
      const colors: Record<string, string> = { admin: 'red', leader: 'gold', member: 'blue' };
      return <Tag color={colors[r]}>{r}</Tag>;
    }},
    { title: '状态', dataIndex: 'is_active', render: (v: number, record: any) => (
      <Popconfirm
        title={v ? '确认停用？该用户将无法使用钉钉机器人' : '确认启用？'}
        onConfirm={() => handleToggleActive(record)}
      >
        <Switch checked={!!v} size="small" />
      </Popconfirm>
    )},
    { title: 'Agent', dataIndex: 'agent_id', width: 100, render: (_: any, record: any) => {
      if (!record.is_active) return <Tag>-</Tag>;
      return record.agent_id ? <Tag color="green">已绑定</Tag> : <Tag color="orange">未同步</Tag>;
    }},
    { title: '操作', render: (_: any, record: any) => (
      <Space>
        <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingUser(record); form.setFieldsValue(record); setModalOpen(true); }}>编辑</Button>
        <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}><Button size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
      </Space>
    )},
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="搜索姓名或钉钉ID" onSearch={v => { setSearch(v); setPage(1); fetchUsers(1, v); }} allowClear style={{ width: 250 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingUser(null); form.resetFields(); setModalOpen(true); }}>添加用户</Button>
        <Upload accept=".xlsx,.csv" showUploadList={false} beforeUpload={handleImportFile}><Button icon={<UploadOutlined />}>导入Excel</Button></Upload>
        <Button loading={syncing} icon={<SyncOutlined spin={syncing} />} onClick={handleSync}>同步到OpenClaw</Button>
        {selectedRowKeys.length > 0 && (
          <>
            <Button type="primary" onClick={() => handleBatchUpdate(1)}>批量启用 ({selectedRowKeys.length})</Button>
            <Button danger onClick={() => handleBatchUpdate(0)}>批量停用 ({selectedRowKeys.length})</Button>
          </>
        )}
      </Space>

      <Table columns={columns} dataSource={users.map(u => ({ ...u, key: u.id }))} loading={loading}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys: any[]) => setSelectedRowKeys(keys),
        }}
        pagination={{ current: page, total, pageSize: 20, onChange: p => { setPage(p); fetchUsers(p); } }} />

      <Modal title={editingUser ? '编辑用户' : '添加用户'} open={modalOpen} onOk={handleSave} onCancel={() => { setModalOpen(false); setEditingUser(null); }}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="dingtalk_id" label="钉钉ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="department_id" label="部门">
            <Select allowClear placeholder="选择部门" options={departments.map(d => ({ label: d.name, value: d.id }))} />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="member">
            <Select options={[{ label: '普通成员', value: 'member' }, { label: '领导', value: 'leader' }, { label: '管理员', value: 'admin' }]} />
          </Form.Item>
          <Form.Item name="is_active" label="状态" initialValue={1}>
            <Select options={[{ label: '启用', value: 1 }, { label: '停用', value: 0 }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`导入预览 (${importData.length} 条)`} open={importModalOpen} onOk={handleImportConfirm} onCancel={() => setImportModalOpen(false)} width={700}>
        <Table size="small" pagination={false} scroll={{ y: 400 }}
          dataSource={importData.map((d, i) => ({ ...d, key: i }))}
          columns={[
            { title: '姓名', dataIndex: 'name' },
            { title: '钉钉ID', dataIndex: 'dingtalk_id' },
            { title: '部门', dataIndex: 'department' },
            { title: '角色', dataIndex: 'role' },
          ]} />
      </Modal>

      <Modal title="同步结果" open={!!syncResult} onCancel={() => setSyncResult(null)} footer={<Button onClick={() => setSyncResult(null)}>关闭</Button>}>
        {syncResult && (
          <div>
            {syncResult.agents?.added?.length > 0 && (
              <p>新增 Agent: <strong>{syncResult.agents.added.length}</strong> 人 — {syncResult.agents.added.map((a: any) => a.name || a).join('、')}</p>
            )}
            {syncResult.agents?.removed?.length > 0 && (
              <p>移除 Agent: <strong>{syncResult.agents.removed.length}</strong> 人 — {syncResult.agents.removed.map((a: any) => a.name || a).join('、')}</p>
            )}
            <p>总计活跃 Agent: <strong>{syncResult.agents?.agentCount ?? 0}</strong> 人</p>
            <p>allowList 人数: <strong>{syncResult.allowList?.count ?? 0}</strong></p>
            {syncResult.allowList?.result === 'error' && (
              <p style={{ color: 'red' }}>allowList 错误: {syncResult.allowList?.errorMessage}</p>
            )}
            {syncResult.agents?.result === 'error' && (
              <p style={{ color: 'red' }}>Agent 同步错误: {syncResult.agents?.errorMessage}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
