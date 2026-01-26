async function uploadFiles(siteId, files) {
  const userId = firebase.auth().currentUser.uid;
  const promises = [];
  for(const file of files) {
    const ref = firebase.storage().ref(`uploads/${userId}/${siteId}/${file.name}`);
    promises.push(ref.put(file));
  }
  await Promise.all(promises);
  alert("Files uploaded successfully!");
}
