import React, { useState, useEffect } from 'react';

export default function Settings({ userRole, onLogout }) {
  const [usersList, setUsersList] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('User');
  
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  // Normalisasi string userRole ke huruf kecil
  const isUserAdmin = userRole?.toLowerCase() === 'admin';

  // Ambil daftar user dari backend Node.js
  const fetchUsers = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsersList(data);
      }
    } catch (err) {
      console.error('Gagal mengambil daftar user:', err);
    }
  };

  useEffect(() => {
    if (isUserAdmin) {
      fetchUsers();
    }
  }, [isUserAdmin]);

  // Handler Submit Tambah Email Baru
  const handleAddUser = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!newEmail.trim()) {
      setMessage({ type: 'error', text: 'Email wajib diisi!' });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          name: newName,
          role: newRole
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Gagal menambahkan user');
      }

      setMessage({ type: 'success', text: 'Email berhasil ditambahkan ke whitelist!' });
      setNewEmail('');
      setNewName('');
      setNewRole('User');
      fetchUsers();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // Proteksi Tampilan: Jika BUKAN Admin
  if (!isUserAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3">
          <div className="text-3xl">🚫</div>
          <h3 className="text-lg font-bold text-amber-800">Akses Dibatasi</h3>
          <p className="text-sm text-amber-700">
            Halaman Pengaturan & Pengelolaan User hanya dapat diakses oleh akun berkategori <strong>Admin</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Pengaturan Whitelist Akses</h1>
        <p className="text-sm text-slate-500">Kelola siapa saja email yang diizinkan masuk ke dashboard ini.</p>
      </div>

      {/* FORM TAMBAH USER BARU */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-800">Tambah Email Baru</h2>

        {message.text && (
          <div className={`p-3 text-xs rounded-xl font-medium ${
            message.type === 'error' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="email"
            placeholder="Alamat Email (Wajib)"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
            required
          />

          <input
            type="text"
            placeholder="Nama Pengguna (Opsional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100"
          />

          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100 bg-white"
          >
            <option value="User">User (Lihat Data)</option>
            <option value="Admin">Admin (Akses Penuh)</option>
          </select>

          <button
            type="submit"
            disabled={isLoading}
            className="py-2.5 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium text-sm rounded-xl transition-all shadow-sm disabled:opacity-50"
          >
            {isLoading ? 'Menyimpan...' : 'Tambah Email'}
          </button>
        </form>
      </div>

      {/* TABEL DAFTAR USER WHITELIST */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Daftar Pengguna Terdaftar ({usersList.length})</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Nama</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Tgl Terdaftar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersList.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{u.email}</td>
                  <td className="px-6 py-4">{u.name || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-lg ${
                      u.role?.toLowerCase() === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">
                    {new Date(u.created_at).toLocaleDateString('id-ID')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}