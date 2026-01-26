document.addEventListener('DOMContentLoaded', () => {
  const emailEl = document.getElementById('email');
  const passwordEl = document.getElementById('password');
  const loginBtn = document.getElementById('login-btn');
  const authErrorEl = document.getElementById('auth-error');
  const userInfoEl = document.getElementById('user-info');
  const userEmailSpan = document.getElementById('user-email');
  const goDashboardBtn = document.getElementById('go-dashboard');
  const logoutBtn = document.getElementById('logout-btn');
  const loginFormEl = document.getElementById('login-form');

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      userEmailSpan.textContent = user.email;
      userInfoEl.classList.remove('hidden');
      loginFormEl.classList.add('hidden');
    } else {
      userInfoEl.classList.add('hidden');
      loginFormEl.classList.remove('hidden');
    }
  });

  loginBtn.addEventListener('click', async () => {
    authErrorEl.textContent = '';
    const email = emailEl.value.trim();
    const password = passwordEl.value.trim();
    if (!email || !password) {
      authErrorEl.textContent = 'Email and password required.';
      return;
    }
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        try {
          await auth.createUserWithEmailAndPassword(email, password);
        } catch (e2) {
          authErrorEl.textContent = e2.message;
        }
      } else {
        authErrorEl.textContent = err.message;
      }
    }
  });

  goDashboardBtn.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });

  logoutBtn.addEventListener('click', () => auth.signOut());
});
