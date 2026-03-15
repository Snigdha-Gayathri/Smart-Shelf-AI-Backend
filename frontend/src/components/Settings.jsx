import React, { useState } from 'react'

const API_BASE = (import.meta.env.VITE_BACKEND_URL || '').trim() || (import.meta.env.PROD ? window.location.origin : '')

export default function Settings({ 
  theme, 
  setTheme, 
  onLogout, 
  onDeleteAccount,
  userEmail,
  username,
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [profilePicture, setProfilePicture] = useState(null)
  const [uploadMessage, setUploadMessage] = useState('')
  const fileInputRef = React.useRef(null)

  // Password change modal state (mock OTP flow)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordStep, setPasswordStep] = useState('otp') // 'otp' | 'password' | 'success'
  const [otpInput, setOtpInput] = useState('')
  const [otpToken, setOtpToken] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwInfo, setPwInfo] = useState('')
  const [otpHelperLoading, setOtpHelperLoading] = useState(false)
  const [demoOtp, setDemoOtp] = useState('')
  const [currentPass, setCurrentPass] = useState('')

  const passwordRuleMessage = 'Password must contain: 8-16 characters, letters, numbers, and at least one special character.'

  const resetPasswordFlow = () => {
    setPasswordStep('otp')
    setOtpInput('')
    setOtpToken('')
    setNewPass('')
    setConfirmPass('')
    setPwError('')
    setPwInfo('')
    setDemoOtp('')
    setCurrentPass('')
  }

  const isStrongPassword = (pw) => {
    if (!pw || pw.length < 8 || pw.length > 16) return false
    if (!/[A-Za-z]/.test(pw)) return false
    if (!/\d/.test(pw)) return false
    if (!/[^A-Za-z0-9]/.test(pw)) return false
    return true
  }

  const handleProfilePictureUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setUploadMessage('File size must be less than 5MB')
      setTimeout(() => setUploadMessage(''), 3000)
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setProfilePicture(reader.result)
      localStorage.setItem('profilePicture', reader.result)
      setUploadMessage('Profile picture updated!')
      setTimeout(() => setUploadMessage(''), 3000)
    }
    reader.readAsDataURL(file)
  }

  const handleDeleteProfilePicture = () => {
    setProfilePicture(null)
    try {
      localStorage.removeItem('profilePicture')
    } catch {}
    setUploadMessage('Profile picture removed')
    setTimeout(() => setUploadMessage(''), 3000)
  }

  // ---- OTP flow handlers ----
  const requestOtp = async () => {
    setPwError('')
    setPwInfo('')
    setDemoOtp('')
    if (!username) {
      setPwError('You must be logged in to change password')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase() })
      })
      const data = await res.json()
      if (data.status === 'ok') {
        if (data.otp) {
          setDemoOtp(data.otp)
          setPwInfo(`Demo OTP: ${data.otp}. Enter this OTP to verify.`)
        } else {
          setPwInfo(data.message || 'OTP generated. Enter it here to continue.')
        }
      } else {
        setPwError(data.error || 'Failed to request OTP')
      }
    } catch (e) {
      setPwError('Network error requesting OTP')
    }
  }

  const verifyOtp = async () => {
    setPwError('')
    setPwInfo('')
    if (!otpInput.trim()) {
      setPwError('OTP is required')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: (username || '').trim().toLowerCase(), otp: otpInput.trim() })
      })
      const data = await res.json()
      if (data.status === 'ok' && data.token) {
        setOtpToken(data.token)
        setPasswordStep('password')
        setPwInfo('OTP verified. Set your new password and confirm it.')
      } else {
        setPwError(data.error || 'Invalid OTP')
      }
    } catch (e) {
      setPwError('Network error verifying OTP')
    }
  }

  const fetchLatestOtp = async () => {
    setPwError('')
    setOtpHelperLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/latest-otp`)
      const data = await res.json()

      if (data.status !== 'ok' || !data.has_otp) {
        setPwError('No OTP available yet. Click Generate OTP first.')
        return
      }

      const expected = (username || '').trim().toLowerCase()
      const actual = (data.username || '').trim().toLowerCase()
      if (expected && actual && expected !== actual) {
        setPwError('Latest OTP belongs to another username. Generate OTP again for your account.')
        return
      }

      setOtpInput(data.otp || '')
      setPwInfo(`Latest OTP fetched: ${data.otp}`)
    } catch (e) {
      setPwError('Unable to fetch latest OTP from backend')
    } finally {
      setOtpHelperLoading(false)
    }
  }

  const submitNewPassword = async () => {
    setPwError('')
    setPwInfo('')
    if (!currentPass) {
      setPwError('Current password is required')
      return
    }
    if (!isStrongPassword(newPass)) {
      setPwError(passwordRuleMessage)
      return
    }
    if (newPass !== confirmPass) {
      setPwError('Passwords do not match')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, current_password: currentPass, new_password: newPass, token: otpToken })
      })
      const data = await res.json()
      if (data.status === 'ok') {
        setPasswordStep('success')
        setPwInfo(data.message || 'Password successfully updated.')
      } else {
        setPwError(data.error || 'Failed to change password')
      }
    } catch (e) {
      setPwError('Network error changing password')
    }
  }

  const handleDeleteAccount = () => {
    if (deleteConfirmText !== 'DELETE') {
      return
    }
    setShowDeleteModal(false)
    setDeleteConfirmText('')
    onDeleteAccount && onDeleteAccount()
  }

  // Load profile picture from localStorage on mount
  React.useEffect(() => {
    const saved = localStorage.getItem('profilePicture')
    if (saved) setProfilePicture(saved)
  }, [])

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 sm:space-y-8">
      {/* Profile Section */}
      <section className="glass rounded-xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-semibold text-primary dark:text-primary mb-4 sm:mb-6">Profile</h3>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-6">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-cool-light dark:bg-slate-700 flex items-center justify-center">
            {profilePicture ? (
              <img src={profilePicture} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl">👤</span>
            )}
          </div>
          <div className="flex-1">
            {/* Hidden native file input to avoid default placeholder text */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleProfilePictureUpload}
              className="sr-only"
            />

            {/* Conditional actions based on whether a profile picture exists */}
            {!profilePicture ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 sm:py-2.5 rounded-md bg-cool-blue text-white font-medium hover:bg-cool-accent transition text-sm sm:text-base"
              >
                Choose File
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 sm:py-2.5 rounded-md bg-cool-blue text-white font-medium hover:bg-cool-accent transition text-sm sm:text-base whitespace-nowrap"
                >
                  Edit Profile Picture
                </button>
                <button
                  type="button"
                  onClick={handleDeleteProfilePicture}
                  className="px-4 py-2 sm:py-2.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm sm:text-base whitespace-nowrap"
                >
                  Delete Profile Picture
                </button>
              </div>
            )}

            {uploadMessage && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">{uploadMessage}</p>
            )}
          </div>
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-400">
          <div><span className="font-medium">Username:</span> {username || 'Not logged in'}</div>
          <span className="font-medium">Email:</span> {userEmail || 'Not logged in'}
        </div>
      </section>

      {/* Password Section */}
      <section className="glass rounded-xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-semibold text-primary dark:text-primary mb-4 sm:mb-6">Password</h3>
        <button
          onClick={() => { setShowPasswordModal(true); resetPasswordFlow() }}
          className="w-full px-4 py-2.5 sm:py-3 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm sm:text-base"
        >
          🔒 Change Password
        </button>
      </section>

      {/* Appearance Section */}
      <section className="glass rounded-xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-semibold text-primary dark:text-primary mb-4 sm:mb-6">Appearance</h3>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-medium text-slate-700 dark:text-slate-300 text-sm sm:text-base">Theme</p>
            <p className="text-xs sm:text-sm text-on-light">Choose your preferred color scheme</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setTheme('light')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                theme === 'light'
                  ? 'bg-cool-blue text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              ☀️ Light
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                theme === 'dark'
                  ? 'bg-cool-blue text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              🌙 Dark
            </button>
          </div>
        </div>
      </section>

      {/* Account Actions */}
      <section className="glass rounded-xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-semibold text-primary dark:text-primary mb-4 sm:mb-6">Account</h3>
        
        <button
          onClick={onLogout}
          className="w-full px-4 py-2.5 sm:py-3 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm sm:text-base"
        >
          🚪 Logout
        </button>
      </section>

      {/* Danger Zone */}
      <section className="bg-red-50/50 dark:bg-red-900/15 backdrop-blur-lg rounded-xl shadow-lg p-4 sm:p-6 border border-red-200/50 dark:border-red-800/30">
        <h3 className="text-lg sm:text-xl font-semibold text-red-600 dark:text-red-400 mb-2">Danger Zone</h3>
        <p className="text-xs sm:text-sm text-on-light mb-4">
          Once you delete your account, there is no going back. This will permanently delete all your data.
        </p>
        
        <button
          onClick={() => setShowDeleteModal(true)}
          className="px-4 py-2.5 sm:py-3 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition text-sm sm:text-base"
        >
          🗑️ Delete Account
        </button>
      </section>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeleteModal(false)}
          >
            <div 
              className="glass-strong rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md p-4 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-400 mb-3 sm:mb-4">
                ⚠️ Delete Account
              </h3>
              <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 mb-3 sm:mb-4">
                This action <strong>cannot be undone</strong>. All your reading data, preferences, and analytics will be permanently deleted.
              </p>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-3 sm:mb-4">
                Type <strong className="text-red-600 dark:text-red-400">DELETE</strong> to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 mb-4 sm:mb-6 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="flex gap-3 flex-col-reverse sm:flex-row">
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setDeleteConfirmText('')
                  }}
                  className="flex-1 px-4 py-2 sm:py-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm sm:text-base"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE'}
                  className={`flex-1 px-4 py-2 sm:py-2.5 rounded-lg font-medium transition text-sm sm:text-base ${
                    deleteConfirmText === 'DELETE'
                      ? 'bg-red-600 text-white hover:bg-red-700 cursor-pointer'
                      : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Delete Forever
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowPasswordModal(false); resetPasswordFlow() }}>
          <div className="glass-strong rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg sm:text-xl font-bold text-primary dark:text-primary mb-4">Change Password</h3>

            {passwordStep === 'otp' && (
              <div className="space-y-4">
                <label className="block text-xs sm:text-sm text-slate-700 dark:text-slate-300">Username: {username}</label>
                <label className="block text-xs sm:text-sm text-slate-700 dark:text-slate-300">Enter OTP</label>
                <input
                  type="text"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  maxLength={6}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-cool-blue"
                />
                {demoOtp && (
                  <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300">
                    Demo OTP: {demoOtp}<br />
                    Enter this OTP to verify.
                  </div>
                )}
                <button
                  onClick={fetchLatestOtp}
                  disabled={otpHelperLoading}
                  className="w-full text-[11px] sm:text-xs text-cool-blue hover:underline disabled:opacity-60"
                >
                  {otpHelperLoading ? 'Fetching latest OTP…' : 'Show OTP from backend (testing helper)'}
                </button>
                {pwInfo && <p className="text-xs sm:text-sm text-green-600 dark:text-green-400">{pwInfo}</p>}
                {pwError && <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{pwError}</p>}
                <div className="flex gap-3 flex-col-reverse sm:flex-row">
                  <button onClick={() => { setShowPasswordModal(false); resetPasswordFlow() }} className="flex-1 px-4 py-2 sm:py-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm sm:text-base">Cancel</button>
                  <button onClick={requestOtp} className="flex-1 px-4 py-2 sm:py-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm sm:text-base">Generate OTP</button>
                  <button onClick={verifyOtp} className="flex-1 px-4 py-2 sm:py-2.5 rounded-lg bg-cool-blue text-white font-medium hover:bg-cool-accent transition text-sm sm:text-base">Verify OTP</button>
                </div>
              </div>
            )}

            {passwordStep === 'password' && (
              <div className="space-y-4">
                <label className="block text-xs sm:text-sm text-slate-700 dark:text-slate-300">Current Password</label>
                <input
                  type="password"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-cool-blue"
                />
                <label className="block text-xs sm:text-sm text-slate-700 dark:text-slate-300">Enter New Password</label>
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border ${newPass && !isStrongPassword(newPass) ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'} bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-cool-blue`}
                />
                {newPass && !isStrongPassword(newPass) && (
                  <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{passwordRuleMessage}</p>
                )}
                <label className="block text-xs sm:text-sm text-slate-700 dark:text-slate-300">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-cool-blue"
                />
                {pwInfo && <p className="text-xs sm:text-sm text-green-600 dark:text-green-400">{pwInfo}</p>}
                {pwError && <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{pwError}</p>}
                <div className="flex gap-3 flex-col-reverse sm:flex-row">
                  <button onClick={() => { setShowPasswordModal(false); resetPasswordFlow() }} className="flex-1 px-4 py-2 sm:py-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition text-sm sm:text-base">Cancel</button>
                  <button
                    onClick={submitNewPassword}
                    disabled={!currentPass || !newPass || newPass !== confirmPass || !isStrongPassword(newPass)}
                    className={`flex-1 px-4 py-2 sm:py-2.5 rounded-lg font-medium transition text-sm sm:text-base ${(!currentPass || !newPass || newPass !== confirmPass || !isStrongPassword(newPass)) ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-cool-blue text-white hover:bg-cool-accent'}`}
                  >
                    Update Password
                  </button>
                </div>
              </div>
            )}

            {passwordStep === 'success' && (
              <div className="space-y-4 text-center">
                <p className="text-sm sm:text-base text-green-600 dark:text-green-400 font-medium">Your password has been changed successfully.</p>
                {pwInfo && <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">{pwInfo}</p>}
                <button onClick={() => { setShowPasswordModal(false); resetPasswordFlow() }} className="w-full px-4 py-2 sm:py-2.5 rounded-lg bg-cool-blue text-white font-medium hover:bg-cool-accent transition text-sm sm:text-base">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
