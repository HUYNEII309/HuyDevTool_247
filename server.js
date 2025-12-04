// server.js - Backend Node.js với Express
const express = require('express');
const sql = require('mssql');
const app = express();

app.use(express.json());

// Cấu hình CORS nếu cần
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Endpoint kiểm tra kết nối
app.post('/api/test-connection', async (req, res) => {
    const { serverName, databaseName, username, password, useWindowAuth } = req.body;

    try {
        // Tạo cấu hình kết nối
        const config = {
            server: serverName,
            database: databaseName,
            authentication: {
                type: useWindowAuth ? 'default' : 'basic',
                options: useWindowAuth ? {} : {
                    userName: username,
                    password: password
                }
            },
            options: {
                encrypt: true,
                trustServerCertificate: true,
                connectTimeout: 5000,
                requestTimeout: 5000
            }
        };

        // Tạo pool kết nối
        const pool = new sql.ConnectionPool(config);
        
        // Kiểm tra kết nối
        await pool.connect();
        
        // Thực hiện query đơn giản để xác nhận
        const result = await pool.request().query('SELECT 1 as connection_test');
        
        // Đóng kết nối
        await pool.close();

        res.json({
            success: true,
            message: 'Kết nối thành công!',
            data: {
                server: serverName,
                database: databaseName,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Lỗi kết nối SQL:', error.message);
        
        let errorMessage = 'Không thể kết nối đến SQL Server';
        
        // Xử lý các lỗi phổ biến
        if (error.message.includes('ENOTFOUND')) {
            errorMessage = 'Không tìm thấy server. Kiểm tra tên server.';
        } else if (error.message.includes('ESOCKET')) {
            errorMessage = 'Lỗi kết nối mạng. Kiểm tra cổng SQL Server.';
        } else if (error.message.includes('Login failed')) {
            errorMessage = 'Tên đăng nhập hoặc mật khẩu không đúng.';
        } else if (error.message.includes('Cannot open database')) {
            errorMessage = 'Cơ sở dữ liệu không tồn tại.';
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Kết nối hết thời gian chờ. Server có thể không phản hồi.';
        }

        res.json({
            success: false,
            message: errorMessage,
            error: error.message
        });
    }
});

// Route static files
app.use(express.static('public'));

// Server lắng nghe
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
});