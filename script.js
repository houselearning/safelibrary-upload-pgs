function uploadFile() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);

  fetch('https://safelibrary-upload-api.onrender.com/upload', {
    method: 'POST',
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    document.getElementById('result').innerText = data.message;
  })
  .catch(err => console.error(err));
}
