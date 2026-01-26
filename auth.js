// Sign up
async function signup(email, password) {
  const userCredential = await auth.createUserWithEmailAndPassword(email, password);
  return userCredential.user.uid;
}

// Sign in
async function signin(email, password) {
  const userCredential = await auth.signInWithEmailAndPassword(email, password);
  return userCredential.user.uid;
}

// Sign out
function signout() {
  return auth.signOut();
}
