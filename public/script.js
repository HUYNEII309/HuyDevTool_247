// public/script.js
const loginForm = document.getElementById('loginForm');
const keyInput = document.getElementById('key');

// --- HÀM VALIDATION MỚI (GỌI SERVER API) ---

async function submitKey() {
    const key = keyInput.value.trim();
    const messageEl = document.getElementById('toast');

    // Basic client-side check (chỉ để kiểm tra rỗng)
    if (key === '') {
        showToast('Vui lòng nhập mã key', 'error');
        return;
    }
    
    // Gửi yêu cầu POST tới Server
    try {
        const response = await fetch('/api/validate-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key })
        });

        const data = await response.json();

        if (data.success) {
            onKeySuccess(key);
        } else {
            // Lỗi 401 hoặc lỗi logic từ server
            showToast(data.message || 'Lỗi xác thực key', 'error');
        }

    } catch (err) {
        console.error('Lỗi kết nối Server:', err);
        showToast('Lỗi kết nối Server, vui lòng thử lại.', 'error');
    }
}


loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    await submitKey(); // Gọi hàm gửi Key lên server
});


keyInput.addEventListener('focus', function () {
    // Tự động ẩn toast khi người dùng bắt đầu nhập
    const t = document.getElementById('toast');
    if (t) t.classList.remove('show');
});


// --- HÀM HIỂN THỊ TOAST, LOADING & REDIRECT (GIỮ NGUYÊN) ---

// showToast hiện tại trả về Promise để đợi hiệu ứng ẩn
function showToast(message, type = '', duration = 3000) {
    const t = document.getElementById('toast');
    if (!t) return Promise.resolve();
    t.className = 'toast';
    if (type === 'success') t.classList.add('success');
    if (type === 'error') t.classList.add('error');

    const iconEl = t.querySelector('.toast-icon');
    const msgEl = t.querySelector('.toast-message');
    if (iconEl) {
        iconEl.innerHTML = type === 'success' ? '&#10003;' : (type === 'error' ? '&#10060;' : '');
    }
    if (msgEl) {
        msgEl.innerText = message;
    }

    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(t._hideTimeout);

    return new Promise(resolve => {
        t._hideTimeout = setTimeout(() => {
            t.classList.remove('show');
            resolve();
        }, duration);
    });
}

// public/script.js (Kiểm tra lại hàm này)

async function onKeySuccess(key) {
    console.log('Mã key hợp lệ, đang chuyển hướng...');
    await showToast('Xác nhận thành công!', 'success', 1200);
    
    // ĐẶT TRẠNG THÁI ĐĂNG NHẬP HỢP LỆ
    try { localStorage.setItem('loggedIn', 'true'); } catch (e) {}
    
    // Chuyển hướng đến trang Home.html sau 2 giây
    showLoadingAndRedirect('Home.html', 2000); 
}

function showLoadingAndRedirect(url, delay = 1000) {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        // Đảm bảo không đặt 'loggedIn' ở đây, chỉ đặt trong onKeySuccess
        setTimeout(() => { window.location.href = url; }, delay);
        return;
    }
    overlay.style.display = 'flex';
    void overlay.offsetWidth;
    // Đảm bảo không đặt 'loggedIn' ở đây
    setTimeout(() => {
        window.location.href = url;
    }, delay);
}