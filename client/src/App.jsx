import React, { useState, useEffect } from 'react';
import './App.css';

// Automatically routes to port 5000 inside ByteXL or localhost
const getApiUrl = () => {
  if (typeof window !== 'undefined' && window.location.pathname.includes('/proxy/')) {
    return `${window.location.origin}/proxy/5000/api`;
  }
  return '/api';
};

const API_URL = getApiUrl();

export default function App() {
  // Tabs: 'home' | 'feed' | 'report' | 'track' | 'admin'
  const [activeTab, setActiveTab] = useState('home');
  const [issues, setIssues] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, inProgress: 0, resolved: 0, critical: 0 });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Authentication State
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('waterwatch_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authFormData, setAuthFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: ''
  });

  // Filters & Search
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [urgencyFilter, setUrgencyFilter] = useState('All');

  // Reporting Form State (Citizen only)
  const [formData, setFormData] = useState({
    title: '',
    category: 'Leakage',
    description: '',
    urgency: 'Medium',
    address: '',
    landmark: '',
    ward: '',
    photo: '',
    name: user?.name || '',
    phone: user?.phone || '',
    email: user?.email || '',
  });

  // Admin Update Modal
  const [editingIssue, setEditingIssue] = useState(null);
  const [adminStatus, setAdminStatus] = useState('Pending');
  const [adminRemarks, setAdminRemarks] = useState('');

  // Photo Zoom Lightbox
  const [zoomedPhoto, setZoomedPhoto] = useState(null);

  // Tracking Search
  const [trackQuery, setTrackQuery] = useState('');
  const [trackedIssue, setTrackedIssue] = useState(null);

  useEffect(() => {
    fetchIssues();
    fetchStats();
  }, [search, categoryFilter, statusFilter, urgencyFilter, user]);

  const fetchIssues = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (categoryFilter !== 'All') params.append('category', categoryFilter);
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (urgencyFilter !== 'All') params.append('urgency', urgencyFilter);
      if (search) params.append('search', search);

      const res = await fetch(`${API_URL}/issues?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch issues');
      const data = await res.json();
      setIssues(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      // Citizen logged in: show their own report stats. Otherwise community total.
      const url = user?.id && user?.role === 'citizen'
        ? `${API_URL}/issues/stats?userId=${user.id}`
        : `${API_URL}/issues/stats`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Convert uploaded image to Base64
  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, photo: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  // Auto-Detect Location
  const detectLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFormData((prev) => ({
            ...prev,
            address: prev.address || `GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
          }));
          alert('GPS location captured successfully!');
        },
        () => alert('Unable to detect location. Please type manually.')
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

  // Submit Report (Citizen)
  const handleReportSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!formData.title || !formData.address || !formData.description) {
      setErrorMsg('Please complete all required fields.');
      return;
    }

    try {
      const payload = {
        title: formData.title,
        category: formData.category,
        description: formData.description,
        urgency: formData.urgency,
        photo: formData.photo,
        location: {
          address: formData.address,
          landmark: formData.landmark,
          ward: formData.ward
        },
        reportedBy: {
          userId: user?.id || '',
          name: formData.name || user?.name || 'Anonymous Citizen',
          email: formData.email || user?.email || '',
          phone: formData.phone || user?.phone || ''
        }
      };

      const res = await fetch(`${API_URL}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error submitting report');

      setSuccessMsg(' Water issue reported successfully! Reference ID: ' + data.issue._id);
      setFormData({
        title: '',
        category: 'Leakage',
        description: '',
        urgency: 'Medium',
        address: '',
        landmark: '',
        ward: '',
        photo: '',
        name: user?.name || '',
        phone: user?.phone || '',
        email: user?.email || ''
      });
      fetchIssues();
      fetchStats();
      setTimeout(() => setActiveTab('feed'), 2000);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Admin Update Status
  const handleAdminUpdate = async () => {
    if (!editingIssue) return;
    try {
      const res = await fetch(`${API_URL}/issues/${editingIssue._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: adminStatus,
          adminRemarks: adminRemarks
        })
      });

      if (!res.ok) throw new Error('Failed to update issue');
      setEditingIssue(null);
      fetchIssues();
      fetchStats();
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete Issue
  const handleDeleteIssue = async (id) => {
    if (!window.confirm('Are you sure you want to delete this complaint?')) return;
    try {
      const res = await fetch(`${API_URL}/issues/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      fetchIssues();
      fetchStats();
    } catch (err) {
      alert(err.message);
    }
  };

  // Track Complaint by ID
  const handleTrackSearch = async (e) => {
    e.preventDefault();
    if (!trackQuery.trim()) return;
    try {
      const res = await fetch(`${API_URL}/issues/${trackQuery.trim()}`);
      if (!res.ok) throw new Error('Complaint ID not found');
      const data = await res.json();
      setTrackedIssue(data);
    } catch (err) {
      alert(err.message);
      setTrackedIssue(null);
    }
  };

  // Auth Handler: Login or Citizen Registration
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const endpoint = isRegistering ? '/register' : '/login';

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authFormData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Authentication failed');

      setUser(data.user);
      localStorage.setItem('waterwatch_user', JSON.stringify(data.user));
      setShowAuthModal(false);

      if (data.user.role === 'admin') {
        setActiveTab('admin');
        alert(`Welcome, Water Board Administrator!`);
      } else {
        setActiveTab('feed');
        alert(`Welcome, ${data.user.name}!`);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('waterwatch_user');
    setActiveTab('home');
  };

  return (
    <div className="app-container">
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="nav-brand" onClick={() => setActiveTab('home')}>
          <span>💧</span> WaterWatch
        </div>

        <div className="nav-links">
          <button
            className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            Home
          </button>

          {/* CITIZEN-ONLY TABS */}
          {user?.role === 'citizen' && (
            <>
              <button
                className={`nav-btn ${activeTab === 'feed' ? 'active' : ''}`}
                onClick={() => setActiveTab('feed')}
              >
                Live Issues
              </button>
              <button
                className={`nav-btn ${activeTab === 'report' ? 'active' : ''}`}
                onClick={() => setActiveTab('report')}
              >
                Report Problem
              </button>
              <button
                className={`nav-btn ${activeTab === 'track' ? 'active' : ''}`}
                onClick={() => setActiveTab('track')}
              >
                Track Status
              </button>
            </>
          )}

          {/* ADMIN-ONLY TAB (Authority Dashboard) */}
          {user?.role === 'admin' && (
            <button
              className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              🛠️ Authority Panel
            </button>
          )}
        </div>

        <div className="nav-user">
          {user ? (
            <>
              <span className={`user-badge ${user.role === 'admin' ? 'admin' : ''}`}>
                {user.role === 'admin' ? '🛡️ Administrator' : `👤 Citizen: ${user.name}`}
              </span>
              <button className="btn btn-secondary" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => { setIsRegistering(false); setShowAuthModal(true); }}>
              Login / Register
            </button>
          )}
        </div>
      </nav>

      {/* ================= HERO HEADER ================= */}
      <div className="hero">
        <div className="hero-tag">🌿 COMMUNITY WATER MANAGEMENT</div>
        <h1>Every Drop Counts. Every Action Matters.</h1>
        <p>
          Together, let's build a water-secure community. Report water issues, track complaints, and make a difference through responsible water management.
        </p>

        {/* HERO STATS */}
        <div className="hero-stats">
          <div className="stat-pill">
            <span className="stat-num">{stats.total}</span>
            <span className="stat-label">{user?.role === 'citizen' ? 'My Reports' : 'Total Reports'}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-num">{stats.pending}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-pill">
            <span className="stat-num">{stats.inProgress}</span>
            <span className="stat-label">In Progress</span>
          </div>
          <div className="stat-pill">
            <span className="stat-num">{stats.resolved}</span>
            <span className="stat-label">Resolved</span>
          </div>
          {stats.critical > 0 && (
            <div className="stat-pill" style={{ background: 'rgba(239, 68, 68, 0.35)' }}>
              <span className="stat-num">{stats.critical}</span>
              <span className="stat-label">Critical</span>
            </div>
          )}
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <main className="main-content">
        {/* ================= TAB 1: HOME PAGE ================= */}
        {activeTab === 'home' && (
          <div>
            {/* QUICK ACTIONS BANNER */}
            <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
              <h2 style={{ fontSize: '1.9rem', color: '#1b3b2b', marginBottom: '0.4rem', fontWeight: 800 }}>
                Quick Actions
              </h2>
              <p style={{ color: '#4e6858', marginBottom: '1.25rem' }}>
                {user?.role === 'admin' 
                  ? 'Logged in as Water Board Administrator.' 
                  : user?.role === 'citizen' 
                  ? `Logged in as citizen (${user.name}). Choose an action below:`
                  : 'Please sign in to file complaints'}
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                {user?.role === 'admin' ? (
                  <button
                    className="btn btn-primary"
                    style={{ padding: '0.8rem 1.6rem', fontSize: '1rem' }}
                    onClick={() => setActiveTab('admin')}
                  >
                    Open Authority Management Panel
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '0.8rem 1.6rem', fontSize: '1rem' }}
                      onClick={() => {
                        if (user?.role === 'citizen') setActiveTab('report');
                        else setShowAuthModal(true);
                      }}
                    >
                       Report a Water Problem
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.8rem 1.6rem', fontSize: '1rem' }}
                      onClick={() => {
                        if (user?.role === 'citizen') setActiveTab('track');
                        else setShowAuthModal(true);
                      }}
                    >
                       Track Your Complaint
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.8rem 1.6rem', fontSize: '1rem' }}
                      onClick={() => {
                        if (user?.role === 'citizen') setActiveTab('feed');
                        else setShowAuthModal(true);
                      }}
                    >
                       View Community Feed
                    </button>
                  </>
                )}
              </div>

              {!user && (
                <div style={{ marginTop: '1.2rem', fontSize: '0.85rem', color: '#526b5c' }}>
                  Are you an authority? <span style={{ color: '#1b3b2b', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setIsRegistering(false); setShowAuthModal(true); }}>Login with Admin Credentials</span>
                </div>
              )}
            </div>

            {/* HOW IT WORKS */}
            <div className="section-header">
              <h2>How WaterWatch Works</h2>
              <p>Simple 3-step process to ensure fast and accountable water management.</p>
            </div>
            <div className="steps-grid">
              <div className="step-card">
                <span className="step-badge">STEP 1</span>
                <div className="step-icon">📍</div>
                <h4 style={{ color: '#1b3b2b', marginBottom: '0.5rem' }}>Spot & Submit</h4>
                <p style={{ fontSize: '0.88rem', color: '#4e6858' }}>
                  Spot a broken pipe, overflow, or shortage? Upload a photo and pinpoint your GPS location instantly.
                </p>
              </div>

              <div className="step-card">
                <span className="step-badge">STEP 2</span>
                <div className="step-icon">🛠️</div>
                <h4 style={{ color: '#1b3b2b', marginBottom: '0.5rem' }}>Authority Dispatch</h4>
                <p style={{ fontSize: '0.88rem', color: '#4e6858' }}>
                  Municipal maintenance teams review your report and dispatch field repair crews to the location.
                </p>
              </div>

              <div className="step-card">
                <span className="step-badge">STEP 3</span>
                <div className="step-icon">✅</div>
                <h4 style={{ color: '#1b3b2b', marginBottom: '0.5rem' }}>Track to Resolution</h4>
                <p style={{ fontSize: '0.88rem', color: '#4e6858' }}>
                  Follow progress through our live status stepper and view official remarks once repaired.
                </p>
              </div>
            </div>

            {/* ABOUT WATERWATCH SECTION */}
            <div className="about-card">
              <div className="about-text">
                <h3 style={{ fontSize: '1.6rem', color: '#1b3b2b', marginBottom: '0.8rem', fontWeight: 800 }}>
                  About WaterWatch Community Initiative
                </h3>
                <p style={{ marginBottom: '1rem' }}>
                  Clean water is our most precious shared resource. Millions of liters of clean drinking water are lost every day due to delayed reporting of pipeline fractures and unattended storage tank overflows.
                </p>
                <p>
                  <strong>WaterWatch</strong> is a civic technology platform that empowers residents to report water issues directly to municipal authorities. With photo evidence and GPS tracking, we eliminate bureaucratic delays and ensure every leak is fixed fast.
                </p>
              </div>

              <div className="about-highlight-box">
                <h4 style={{ color: '#1b3b2b', marginBottom: '0.6rem' }}>🌟 Community Impact</h4>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '0.9rem', color: '#33503e', lineHeight: 1.8 }}>
                  <li><strong>Fast Response:</strong> 3x quicker field team deployment.</li>
                  <li><strong>Water Saved:</strong> Thousands of liters protected weekly.</li>
                  <li><strong>Safe Drinking:</strong> Instant contamination alerts to protect health.</li>
                </ul>
              </div>
            </div>

            {/* PLATFORM FEATURES */}
            <div className="section-header">
              <h2>Reporting Categories & Services</h2>
              <p>Specialized modules designed to cover every type of water problem in your neighborhood.</p>
            </div>
            <div className="home-features">
              <div className="feature-card">
                <div className="feature-icon">💧</div>
                <h4 style={{ color: '#1b3b2b', marginBottom: '0.4rem' }}>Water Leakage</h4>
                <p style={{ fontSize: '0.88rem', color: '#4e6858' }}>
                  Report sidewalk leaks, fractured pipes, and road flooding before massive volumes are wasted.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">🪣</div>
                <h4 style={{ color: '#1b3b2b', marginBottom: '0.4rem' }}>Water Shortage</h4>
                <p style={{ fontSize: '0.88rem', color: '#4e6858' }}>
                  Notify the water board of irregular timing or low pressure to request tanker dispatch.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">☣️</div>
                <h4 style={{ color: '#1b3b2b', marginBottom: '0.4rem' }}>Contamination</h4>
                <p style={{ fontSize: '0.88rem', color: '#4e6858' }}>
                  Report dirty, discolored, or foul-smelling tap water to protect community drinking water safety.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">🌊</div>
                <h4 style={{ color: '#1b3b2b', marginBottom: '0.4rem' }}>Tank Overflow</h4>
                <p style={{ fontSize: '0.88rem', color: '#4e6858' }}>
                  Report overflowing overhead tanks to stop continuous loss of treated municipal water.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: LIVE ISSUES (CITIZEN ONLY) ================= */}
        {activeTab === 'feed' && user?.role === 'citizen' && (
          <div>
            <div className="controls-bar">
              <input
                type="text"
                className="search-input"
                placeholder="Search by title, address, landmark, or reporter..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                className="select-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="All">All Categories</option>
                <option value="Leakage">💧 Leakage</option>
                <option value="Water Shortage">🪣 Water Shortage</option>
                <option value="Contamination">☣️ Contamination</option>
                <option value="Tank Overflow">🌊 Tank Overflow</option>
                <option value="Pipeline Damage">🔧 Pipeline Damage</option>
                <option value="Wastage">🚿 Wastage</option>
              </select>

              <select
                className="select-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Rejected">Rejected</option>
              </select>

              <select
                className="select-filter"
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value)}
              >
                <option value="All">All Urgencies</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', padding: '2rem' }}>Loading reported issues...</p>
            ) : issues.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#4e6858', padding: '3rem' }}>
                No water issues found matching your filters.
              </p>
            ) : (
              <div className="issues-grid">
                {issues.map((item) => (
                  <div key={item._id} className="issue-card">
                    {item.photo ? (
                      <img
                        src={item.photo}
                        alt={item.title}
                        className="card-img"
                        onClick={() => setZoomedPhoto(item.photo)}
                        style={{ cursor: 'pointer' }}
                        title="Click to view full photo"
                      />
                    ) : (
                      <div className="card-no-img">
                        {item.category === 'Leakage' && '💧'}
                        {item.category === 'Water Shortage' && '🪣'}
                        {item.category === 'Contamination' && '☣️'}
                        {item.category === 'Tank Overflow' && '🌊'}
                        {item.category === 'Pipeline Damage' && '🔧'}
                        {!['Leakage', 'Water Shortage', 'Contamination', 'Tank Overflow', 'Pipeline Damage'].includes(item.category) && '🚰'}
                      </div>
                    )}

                    <div className="card-body">
                      <div className="card-header-meta">
                        <span className={`badge badge-${item.status.toLowerCase().replace(' ', '-')}`}>
                          {item.status}
                        </span>
                        <span className={`urgency-badge urgency-${item.urgency.toLowerCase()}`}>
                          {item.urgency} Priority
                        </span>
                      </div>

                      <h3 className="card-title">{item.title}</h3>
                      <div className="card-category">Category: {item.category}</div>
                      <p className="card-desc">{item.description}</p>

                      <div className="card-info-row">
                        📍 <strong>Location:</strong> {item.location?.address} {item.location?.landmark ? `(${item.location.landmark})` : ''}
                      </div>
                      <div className="card-info-row">
                        👤 <strong>Reported By:</strong> {item.reportedBy?.name || 'Citizen'}
                      </div>
                      <div className="card-info-row">
                        🕒 <strong>Date:</strong> {new Date(item.createdAt).toLocaleDateString()}
                      </div>

                      {item.adminRemarks && (
                        <div className="card-remarks">
                          <strong>Authority Update:</strong> {item.adminRemarks}
                        </div>
                      )}

                      <div className="card-actions">
                        <button
                          className="btn btn-secondary"
                          style={{ flex: 1 }}
                          onClick={() => {
                            setTrackQuery(item._id);
                            setActiveTab('track');
                            setTrackedIssue(item);
                          }}
                        >
                          Track Progress
                        </button>

                        {(user && user?.id === item.reportedBy?.userId) && (
                          <button
                            className="btn btn-danger"
                            onClick={() => handleDeleteIssue(item._id)}
                            title="Delete Complaint"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: REPORT A WATER PROBLEM (CITIZEN ONLY) ================= */}
        {activeTab === 'report' && user?.role === 'citizen' && (
          <div className="form-card">
            <h2 className="form-title"> Report Water Problem</h2>
            <p className="form-subtitle">Fill in the details below. Our water board team will be notified immediately.</p>

            {errorMsg && <p style={{ color: 'red', marginBottom: '1rem' }}>{errorMsg}</p>}
            {successMsg && <p style={{ color: 'green', marginBottom: '1rem', fontWeight: 'bold' }}>{successMsg}</p>}

            <form onSubmit={handleReportSubmit}>
              <div className="form-group">
                <label>Issue Category *</label>
                <div className="category-selector">
                  {['Leakage', 'Water Shortage', 'Contamination', 'Tank Overflow', 'Pipeline Damage', 'Wastage'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`cat-btn ${formData.category === cat ? 'selected' : ''}`}
                      onClick={() => setFormData({ ...formData, category: cat })}
                    >
                      {cat === 'Leakage' && '💧 '}
                      {cat === 'Water Shortage' && '🪣 '}
                      {cat === 'Contamination' && '☣️ '}
                      {cat === 'Tank Overflow' && '🌊 '}
                      {cat === 'Pipeline Damage' && '🔧 '}
                      {cat === 'Wastage' && '🚿 '}
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Title / Short Headline *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Major pipe burst near Main Market"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Urgency Level</label>
                  <select
                    className="form-control"
                    value={formData.urgency}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                  >
                    <option value="Low">Low (Minor seep/drip)</option>
                    <option value="Medium">Medium (Moderate issue)</option>
                    <option value="High">High (Serious disruption)</option>
                    <option value="Critical">Critical (Flooding/Drinking Hazard)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Ward / Area Code</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Ward 12, North Zone"
                    value={formData.ward}
                    onChange={(e) => setFormData({ ...formData, ward: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Exact Location / Street Address *</span>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={detectLocation}>
                    📍 Auto-Detect GPS
                  </button>
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Street name, cross road, colony"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Nearby Landmark</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Opposite Post Office, near Water Tank"
                  value={formData.landmark}
                  onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Problem Description *</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="Describe the severity, when it started, how many households are affected..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                ></textarea>
              </div>

              <div className="form-group">
                <label>Photo Evidence (Upload or URL)</label>
                <input
                  type="file"
                  accept="image/*"
                  className="form-control"
                  onChange={handlePhotoUpload}
                />
                <input
                  type="text"
                  className="form-control"
                  style={{ marginTop: '0.5rem' }}
                  placeholder="Or paste an image web URL here"
                  value={formData.photo}
                  onChange={(e) => setFormData({ ...formData, photo: e.target.value })}
                />
                {formData.photo && (
                  <img src={formData.photo} alt="Preview" className="photo-preview" />
                )}
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Your Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Citizen Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Contact Phone</label>
                  <input
                    type="tel"
                    className="form-control"
                    placeholder="Phone number"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', padding: '0.8rem' }}>
                 Submit Water Problem Report
              </button>
            </form>
          </div>
        )}

        {/* ================= TAB 4: TRACK COMPLAINT (CITIZEN ONLY) ================= */}
        {activeTab === 'track' && user?.role === 'citizen' && (
          <div className="form-card" style={{ maxWidth: '750px' }}>
            <h2 className="form-title"> Complaint Tracking</h2>
            <p className="form-subtitle">Enter your Complaint Reference ID below to view live resolution status.</p>

            <form onSubmit={handleTrackSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Paste Complaint ID here (e.g. 653a...)"
                value={trackQuery}
                onChange={(e) => setTrackQuery(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary">Track</button>
            </form>

            {trackedIssue && (
              <div style={{ background: '#edf5ef', padding: '1.5rem', borderRadius: '10px', border: '1px solid #d3e4d8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>{trackedIssue.title}</h3>
                  <span className={`badge badge-${trackedIssue.status.toLowerCase().replace(' ', '-')}`}>
                    {trackedIssue.status}
                  </span>
                </div>

                <div className="tracking-stepper">
                  <div className={`step-node ${['Pending', 'In Progress', 'Resolved'].includes(trackedIssue.status) ? 'completed' : ''}`}>
                    1. Reported
                  </div>
                  <div className={`step-node ${['In Progress', 'Resolved'].includes(trackedIssue.status) ? 'completed' : trackedIssue.status === 'Pending' ? 'active' : ''}`}>
                    2. Under Review
                  </div>
                  <div className={`step-node ${trackedIssue.status === 'In Progress' ? 'active' : trackedIssue.status === 'Resolved' ? 'completed' : ''}`}>
                    3. Repair In Progress
                  </div>
                  <div className={`step-node ${trackedIssue.status === 'Resolved' ? 'completed' : ''}`}>
                    4. Resolved
                  </div>
                </div>

                {trackedIssue.photo && (
                  <div style={{ margin: '1rem 0' }}>
                    <strong>Attached Photo:</strong>
                    <br />
                    <img
                      src={trackedIssue.photo}
                      alt="Complaint attachment"
                      style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '8px', marginTop: '0.5rem', cursor: 'pointer', border: '1px solid #cbd5e1' }}
                      onClick={() => setZoomedPhoto(trackedIssue.photo)}
                    />
                  </div>
                )}

                <p><strong>Category:</strong> {trackedIssue.category}</p>
                <p><strong>Location:</strong> {trackedIssue.location?.address} {trackedIssue.location?.landmark ? `(${trackedIssue.location.landmark})` : ''}</p>
                <p><strong>Description:</strong> {trackedIssue.description}</p>
                <p><strong>Reported On:</strong> {new Date(trackedIssue.createdAt).toLocaleString()}</p>

                {trackedIssue.adminRemarks && (
                  <div className="card-remarks" style={{ marginTop: '1rem' }}>
                    <strong>Authority Official Remarks:</strong> {trackedIssue.adminRemarks}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: ADMIN DASHBOARD (ADMIN ONLY) ================= */}
        {activeTab === 'admin' && user?.role === 'admin' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2>🛠️ Water Authority Management Dashboard</h2>
              <span className="user-badge admin">Administrator Mode</span>
            </div>

            <div className="controls-bar">
              <input
                type="text"
                className="search-input"
                placeholder="Search database..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="select-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>

            <div style={{ overflowX: 'auto', background: 'white', borderRadius: '12px', border: '1px solid #d3e4d8', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#edf5ef', borderBottom: '1px solid #d3e4d8' }}>
                    <th style={{ padding: '0.8rem' }}>Photo Evidence</th>
                    <th style={{ padding: '0.8rem' }}>Date</th>
                    <th style={{ padding: '0.8rem' }}>Title & Category</th>
                    <th style={{ padding: '0.8rem' }}>Location</th>
                    <th style={{ padding: '0.8rem' }}>Priority</th>
                    <th style={{ padding: '0.8rem' }}>Status</th>
                    <th style={{ padding: '0.8rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((item) => (
                    <tr key={item._id} style={{ borderBottom: '1px solid #edf5ef' }}>
                      <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                        {item.photo ? (
                          <img
                            src={item.photo}
                            alt="Evidence"
                            style={{
                              width: '55px',
                              height: '55px',
                              objectFit: 'cover',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              border: '1px solid #cbd5e1'
                            }}
                            onClick={() => setZoomedPhoto(item.photo)}
                            title="Click to zoom in"
                          />
                        ) : (
                          <span style={{ color: '#888', fontSize: '0.8rem' }}>No Photo</span>
                        )}
                      </td>

                      <td style={{ padding: '0.8rem', fontSize: '0.85rem' }}>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.8rem' }}>
                        <strong>{item.title}</strong>
                        <div style={{ fontSize: '0.8rem', color: '#2a553e' }}>{item.category}</div>
                      </td>
                      <td style={{ padding: '0.8rem', fontSize: '0.85rem' }}>
                        {item.location?.address}
                      </td>
                      <td style={{ padding: '0.8rem' }}>
                        <span className={`urgency-badge urgency-${item.urgency.toLowerCase()}`}>
                          {item.urgency}
                        </span>
                      </td>
                      <td style={{ padding: '0.8rem' }}>
                        <span className={`badge badge-${item.status.toLowerCase().replace(' ', '-')}`}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.8rem' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', marginRight: '0.4rem' }}
                          onClick={() => {
                            setEditingIssue(item);
                            setAdminStatus(item.status);
                            setAdminRemarks(item.adminRemarks || '');
                          }}
                        >
                          Update Status
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                          onClick={() => handleDeleteIssue(item._id)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* EDIT STATUS MODAL (ADMIN) */}
      {editingIssue && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '0.5rem', color: '#1b3b2b' }}>Update Status: {editingIssue.title}</h3>
            <p style={{ fontSize: '0.85rem', color: '#4e6858', marginBottom: '1rem' }}>
              Reported by {editingIssue.reportedBy?.name || 'Citizen'} • Location: {editingIssue.location?.address}
            </p>

            {editingIssue.photo && (
              <div style={{ marginBottom: '1rem', background: '#edf5ef', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', textAlign: 'left', marginBottom: '0.4rem' }}>
                  📷 Citizen's Uploaded Photo Evidence:
                </div>
                <img
                  src={editingIssue.photo}
                  alt="Citizen Evidence"
                  style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '6px', objectFit: 'contain', cursor: 'pointer' }}
                  onClick={() => setZoomedPhoto(editingIssue.photo)}
                  title="Click to view full photo"
                />
              </div>
            )}

            <div className="form-group">
              <label>Update Status</label>
              <select
                className="form-control"
                value={adminStatus}
                onChange={(e) => setAdminStatus(e.target.value)}
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress (Dispatching Team)</option>
                <option value="Resolved">Resolved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            <div className="form-group">
              <label>Authority Resolution Remarks</label>
              <textarea
                className="form-control"
                rows="3"
                placeholder="e.g. Pipeline repaired by Maintenance team."
                value={adminRemarks}
                onChange={(e) => setAdminRemarks(e.target.value)}
              ></textarea>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setEditingIssue(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAdminUpdate}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL PHOTO ZOOM LIGHTBOX */}
      {zoomedPhoto && (
        <div className="modal-overlay" onClick={() => setZoomedPhoto(null)}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={zoomedPhoto}
              alt="Zoomed Evidence"
              style={{ width: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
            />
            <button
              className="btn btn-secondary"
              style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.7)', color: 'white', border: 'none' }}
              onClick={() => setZoomedPhoto(null)}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}

      {/* LOGIN / REGISTER MODAL (STRICTLY CITIZEN REGISTRATION) */}
      {showAuthModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ color: '#1b3b2b' }}>
              {isRegistering ? ' Create Citizen Account' : ' Account Login'}
            </h3>

            <form onSubmit={handleAuthSubmit}>
              {/* Only citizens can register */}
              {isRegistering && (
                <>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Enter your name"
                      value={authFormData.name}
                      onChange={(e) => setAuthFormData({ ...authFormData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="Enter 10-digit mobile number"
                      value={authFormData.phone}
                      onChange={(e) => setAuthFormData({ ...authFormData, phone: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder={isRegistering ? "citizen@example.com" : "Email address"}
                  value={authFormData.email}
                  onChange={(e) => setAuthFormData({ ...authFormData, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Enter password"
                  value={authFormData.password}
                  onChange={(e) => setAuthFormData({ ...authFormData, password: e.target.value })}
                  required
                />
              </div>

              

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  {isRegistering ? 'Register as Citizen' : 'Sign In'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsRegistering(!isRegistering)}
                >
                  {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register as Citizen"}
                </button>
                <button
                  type="button"
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  onClick={() => setShowAuthModal(false)}
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}