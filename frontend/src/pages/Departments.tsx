import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Space, message, Tag, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { departmentsApi } from '../api';

export default function Departments() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    const { data } = await departmentsApi.list();
    setDepartments(data.data);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await departmentsApi.update(editing.id, values);
        message.success('更新成功');
      } else {
        await departmentsApi.create(values);
        message.success('创建成功，同时在 AnythingLLM 创建了知识库');
      }
      setModalOpen(false);
      form.resetFields();
      setEditing(null);
      fetch();
    } catch (e: any) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await departmentsApi.delete(id);
      message.success('已删除');
      fetch();
    } catch (e: any) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '部门名称', dataIndex: 'name' },
    { title: '人数', dataIndex: 'user_count', width: 80 },
    { title: '知识库', dataIndex: 'workspace_slug', render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <Tag color="default">未创建</Tag> },
    { title: '操作', render: (_: any, record: any) => (
      <Space>
        <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(record); form.setFieldsValue(record); setModalOpen(true); }}>编辑</Button>
        <Popconfirm title="确认删除？需先移除部门下所有用户" onConfirm={() => handleDelete(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>添加部门</Button>
      </Space>
      <Table columns={columns} dataSource={departments.map(d => ({ ...d, key: d.id }))} loading={loading} pagination={false} />

      <Modal title={editing ? '编辑部门' : '添加部门'} open={modalOpen} onOk={handleSave} onCancel={() => { setModalOpen(false); setEditing(null); }}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="部门名称" rules={[{ required: true }]}><Input placeholder="如：技术部" /></Form.Item>
        </Form>
        {!editing && <p style={{ color: '#888', fontSize: 12 }}>创建部门时会自动在 AnythingLLM 中创建同名知识库 workspace</p>}
      </Modal>
    </div>
  );
}
