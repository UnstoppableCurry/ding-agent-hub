import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Tag, Transfer, Modal, message, Space } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { workspacesApi, usersApi } from '../api';

export default function Workspaces() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editWs, setEditWs] = useState<any>(null);
  const [targetKeys, setTargetKeys] = useState<string[]>([]);

  const fetch = async () => {
    setLoading(true);
    const [wsRes, usersRes] = await Promise.all([workspacesApi.list(), usersApi.list({ pageSize: 1000 })]);
    setWorkspaces(wsRes.data.data);
    setAllUsers(usersRes.data.data);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const handleEdit = (ws: any) => {
    setEditWs(ws);
    setTargetKeys(ws.authorized_users.map((u: any) => String(u.id)));
  };

  const handleSave = async () => {
    try {
      await workspacesApi.setUsers(editWs.department_id, targetKeys.map(Number));
      message.success('权限更新成功');
      setEditWs(null);
      fetch();
    } catch (e: any) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        {workspaces.map(ws => (
          <Card key={ws.department_id} title={`${ws.department_name} 知识库`}
            extra={<Button icon={<SettingOutlined />} onClick={() => handleEdit(ws)}>管理权限</Button>}>
            <p>Workspace: <Tag color="blue">{ws.workspace_slug || '未创建'}</Tag></p>
            <p>授权用户 ({ws.authorized_users.length}):</p>
            <Space wrap>
              {ws.authorized_users.map((u: any) => (
                <Tag key={u.id} color={u.role === 'leader' ? 'gold' : 'default'}>{u.name} ({u.role})</Tag>
              ))}
              {ws.authorized_users.length === 0 && <Tag color="default">暂无授权用户</Tag>}
            </Space>
          </Card>
        ))}
        {workspaces.length === 0 && !loading && <Card>暂无知识库，请先在"部门管理"中创建部门</Card>}
      </Space>

      <Modal title={`管理 "${editWs?.department_name}" 知识库权限`} open={!!editWs} onOk={handleSave} onCancel={() => setEditWs(null)} width={700}>
        <Transfer
          dataSource={allUsers.filter((u: any) => u.is_active).map((u: any) => ({ key: String(u.id), title: `${u.name} (${u.dingtalk_id})` }))}
          targetKeys={targetKeys}
          onChange={setTargetKeys}
          titles={['全部用户', '已授权']}
          render={item => item.title!}
          listStyle={{ width: 280, height: 400 }}
          showSearch
        />
        <p style={{ color: '#888', fontSize: 12, marginTop: 8 }}>leader 角色用户会自动获得所有知识库的访问权限</p>
      </Modal>
    </div>
  );
}
