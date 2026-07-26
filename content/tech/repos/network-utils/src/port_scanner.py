#!/usr/bin/env python3
"""
端口扫描工具
使用多线程快速扫描目标主机的开放端口
"""

import socket
import threading
from queue import Queue
from datetime import datetime

# 常用端口列表
COMMON_PORTS = {
    21: 'FTP',
    22: 'SSH',
    23: 'Telnet',
    25: 'SMTP',
    53: 'DNS',
    80: 'HTTP',
    110: 'POP3',
    143: 'IMAP',
    443: 'HTTPS',
    3306: 'MySQL',
    3389: 'RDP',
    5432: 'PostgreSQL',
    6379: 'Redis',
    8080: 'HTTP-Proxy',
}


class PortScanner:
    def __init__(self, target: str, port_range: tuple = (1, 1024), threads: int = 100):
        self.target = target
        self.start_port, self.end_port = port_range
        self.threads = threads
        self.open_ports = []
        self.queue = Queue()
        self.lock = threading.Lock()

    def scan_port(self, port: int) -> bool:
        """扫描单个端口"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((self.target, port))
            sock.close()
            return result == 0
        except socket.error:
            return False

    def worker(self):
        """工作线程"""
        while True:
            port = self.queue.get()
            if self.scan_port(port):
                with self.lock:
                    service = COMMON_PORTS.get(port, 'Unknown')
                    self.open_ports.append((port, service))
            self.queue.task_done()

    def run(self) -> list:
        """执行扫描"""
        print(f"开始扫描 {self.target}，端口范围: {self.start_port}-{self.end_port}")
        start_time = datetime.now()

        # 创建工作线程
        for _ in range(self.threads):
            t = threading.Thread(target=self.worker, daemon=True)
            t.start()

        # 将端口加入队列
        for port in range(self.start_port, self.end_port + 1):
            self.queue.put(port)

        # 等待所有任务完成
        self.queue.join()

        elapsed = datetime.now() - start_time
        print(f"扫描完成，耗时: {elapsed.total_seconds():.2f} 秒")
        print(f"发现 {len(self.open_ports)} 个开放端口:")

        for port, service in sorted(self.open_ports):
            print(f"  {port}/tcp  open  {service}")

        return self.open_ports


if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("用法: python port_scanner.py <目标IP> [起始端口] [结束端口]")
        sys.exit(1)

    target = sys.argv[1]
    start = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    end = int(sys.argv[3]) if len(sys.argv) > 3 else 1024

    scanner = PortScanner(target, (start, end))
    scanner.run()
