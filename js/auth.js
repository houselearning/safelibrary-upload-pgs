document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const emailEl = document.getElementById('email');
  const passwordEl = document.getElementById('password');
  const loginBtn = document.getElementById('login-btn');
  const authErrorEl = document.getElementById('auth-error');
  const userInfoEl = document.getElementById('user-info');
  const userEmailSpan = document.getElementById('user-email');
  const goDashboardBtn = document.getElementById('go-dashboard');
  const logoutBtn = document.getElementById('logout-btn');
  const loginFormEl = document.getElementById('login-form');

  // Basic sanity checks
  if (!window.firebase || !firebase.auth) {
    console.error('Firebase not initialized or wrong SDK. Check firebase-init.js');
    authErrorEl && (authErrorEl.textContent = 'Internal error: Firebase not loaded');
    return;
  }

  // Auth state observer
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      userEmailSpan.textContent = user.email || user.uid;
      userInfoEl && userInfoEl.classList.remove('hidden');
      loginFormEl && loginFormEl.classList.add('hidden');
    } else {
      userInfoEl && userInfoEl.classList.add('hidden');
      loginFormEl && loginFormEl.classList.remove('hidden');
    }
  });

  // Sign in / sign up flow
  loginBtn && loginBtn.addEventListener('click', async () => {
    authErrorEl.textContent = '';
    const email = (emailEl && emailEl.value || '').trim();
    const password = (passwordEl && passwordEl.value || '').trim();
    if (!email || !password) {
      authErrorEl.textContent = 'Email and password required.';
      return;
    }
    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
    } catch (err) {
      // If user not found, create account
      if (err.code === 'auth/user-not-found') {
        try {
          await firebase.auth().createUserWithEmailAndPassword(email, password);
        } catch (e2) {
          authErrorEl.textContent = e2.message;
          console.error(e2);
        }
      } else {
        authErrorEl.textContent = err.message;
        console.error(err);
      }
    }
  });

  // Dashboard redirect
  goDashboardBtn && goDashboardBtn.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });

  // Sign out
  logoutBtn && logoutBtn.addEventListener('click', async () => {
    try {
      await firebase.auth().signOut();
    } catch (err) {
      console.error('Sign out error', err);
    }
  });
});
