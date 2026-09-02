// src/components/UserManagement.jsx
import React, { useState, useEffect } from 'react';
import { useRole } from '../context/RoleContext';
import './UserManagement.css';

const UserManagement = () => {
  const { isSuperAdmin } = useRole();
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', role_id: 2 });
  const [loading, setLoading] = useState(false);

  if (!isSuperAdmin()) {
    return (
      <div className="access-denied" style={{ padding: '20px', textAlign: 'center' }}>
        <h2>❌ Access Denied</h2>
        <p>Only Super Admin can access User Management</p>
      </div>
    );
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/users/all`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      if (data.success) {
        setUsers(data.data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password) {
      alert('Email dan password harus diisi');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/users/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newUser)
      });

      const data = await response.json();
      if (response.ok) {
        setNewUser({ email: '', password: '', role_id: 2 });
        setShowModal(false);
        fetchUsers();
        alert('✅ User created successfully');
      } else {
        alert('❌ ' + (data.message || 'Error creating user'));
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Error creating user');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (userId) => {
    const newPassword = prompt('Enter new password:');
    if (!newPassword) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/users/reset-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, newPassword })
      });

      if (response.ok) {
        alert('✅ Password reset successfully');
      } else {
        alert('❌ Error resetting password');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleUpdateRole = async (userId, newRoleId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/users/update-role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, role_id: parseInt(newRoleId) })
      });

      if (response.ok) {
        fetchUsers();
        alert('✅ Role updated successfully');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure want to delete this user?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/users/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        fetchUsers();
        alert('✅ User deleted successfully');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div className="user-management">
      <div className="um-header">
        <h2>👥 User Management</h2>
        <button className="btn-add-user" onClick={() => setShowModal(true)}>
          + Add New User
        </button>
      </div>

      <table className="users-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Created Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.length > 0 ? (
            users.map(user => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>
                  <select 
                    value={user.role === 'super_admin' ? 1 : 2}
                    onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                  >
                    <option value="1">Super Admin</option>
                    <option value="2">User</option>
                  </select>
                </td>
                <td>{new Date(user.created_at).toLocaleDateString('id-ID')}</td>
                <td className="actions">
                  <button className="btn-reset" onClick={() => handleResetPassword(user.id)}>
                    🔑 Reset Password
                  </button>
                  <button className="btn-delete" onClick={() => handleDeleteUser(user.id)}>
                    🗑️ Delete
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" style={{ textAlign: 'center' }}>No users found</td>
            </tr>
          )}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add New User</h3>
            <input
              type="email"
              placeholder="Email"
              value={newUser.email}
              onChange={(e) => setNewUser({...newUser, email: e.target.value})}
            />
            <input
              type="password"
              placeholder="Password"
              value={newUser.password}
              onChange={(e) => setNewUser({...newUser, password: e.target.value})}
            />
            <select 
              value={newUser.role_id}
              onChange={(e) => setNewUser({...newUser, role_id: parseInt(e.target.value)})}
            >
              <option value="1">Super Admin</option>
              <option value="2">User</option>
            </select>
            <div className="modal-actions">
              <button className="btn-save" onClick={handleAddUser} disabled={loading}>
                {loading ? 'Creating...' : 'Create User'}
              </button>
              <button className="btn-cancel" onClick={() => setShowModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;