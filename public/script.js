   let stations = [];
        let currentFilter = 'all';

        const API_URL = window.location.origin + '/api';

        // Fetch stations from API
        async function fetchStations() {
            try {
                const response = await fetch(`${API_URL}/stations`);
                stations = await response.json();
                updateStats();
                renderStations();
            } catch (error) {
                console.error('Error fetching stations:', error);
                document.getElementById('stationsGrid').innerHTML = '<div class="empty-state"> Erro ao carregar postos. Verifique sua conexão.</div>';
            }
        }

        // Update statistics
        function updateStats() {
            const total = stations.length;
            const available = stations.filter(s => s.status === 'available').length;
            const reports = stations.reduce((sum, s) => sum + s.reportsCount, 0);
            
            document.getElementById('totalStations').textContent = total;
            document.getElementById('availableStations').textContent = available;
            document.getElementById('totalReports').textContent = reports;
        }

        // Get relative time
        function getRelativeTime(timestamp) {
            const seconds = Math.floor((Date.now() - timestamp) / 1000);
            
            if (seconds < 60) return `há ${seconds} segundos`;
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `há ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `há ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
            const days = Math.floor(hours / 24);
            return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
        }

        // Get status text and class
        function getStatusInfo(status) {
            const statusMap = {
                available: { text: ' Disponível', class: 'status-available' },
                busy: { text: ' Lotado', class: 'status-busy' },
                unavailable: { text: ' Sem Combustível', class: 'status-unavailable' }
            };
            return statusMap[status] || statusMap.unavailable;
        }

        // Render stations
        function renderStations() {
            const grid = document.getElementById('stationsGrid');
            const filteredStations = currentFilter === 'all' 
                ? stations 
                : stations.filter(s => s.status === currentFilter);
            
            if (filteredStations.length === 0) {
                grid.innerHTML = '<div class="empty-state"> Nenhum posto encontrado com este filtro.</div>';
                return;
            }
            
            grid.innerHTML = filteredStations.map(station => {
                const statusInfo = getStatusInfo(station.status);
                return `
                    <div class="card" data-id="${station.id}">
                        <div class="card-header">
                            <div>
                                <div class="station-name">${escapeHtml(station.name)}</div>
                                <div class="station-location">
                                     ${escapeHtml(station.location)}
                                </div>
                            </div>
                            <div class="status-badge ${statusInfo.class}">
                                ${statusInfo.text}
                            </div>
                        </div>
                        <div class="info-row">
                            <span> Confirmações:</span>
                            <span class="confirmations">${station.confirmations || 0}</span>
                        </div>
                        <div class="info-row">
                            <span> Total de reportes:</span>
                            <span>${station.reportsCount || 0}</span>
                        </div>
                        <div class="last-update">
                             Última atualização: ${getRelativeTime(station.lastUpdate)}
                        </div>
                        <div class="card-actions">
                            <button class="btn-confirm" onclick="reportStatus(${station.id}, 'available')">
                                 Confirmar Disponível
                            </button>
                            <button class="btn-report" onclick="reportStatus(${station.id}, 'unavailable')">
                                 Reportar Indisponível
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Simple escape HTML
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Report status
        async function reportStatus(stationId, status) {
            try {
                const response = await fetch(`${API_URL}/stations/${stationId}/report`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status })
                });
                
                if (response.ok) {
                    await fetchStations();
                    showNotification('Reporte registrado com sucesso!', 'success');
                } else {
                    showNotification('Erro ao registrar reporte', 'error');
                }
            } catch (error) {
                console.error('Error reporting status:', error);
                showNotification('Erro ao conectar com o servidor', 'error');
            }
        }

        // Add new station
        async function addStation(event) {
            event.preventDefault();
            
            const name = document.getElementById('stationName').value;
            const location = document.getElementById('stationLocation').value;
            const status = document.getElementById('initialStatus').value;
            
            try {
                const response = await fetch(`${API_URL}/stations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, location, status })
                });
                
                if (response.ok) {
                    await fetchStations();
                    closeAddModal();
                    document.getElementById('addStationForm').reset();
                    showNotification('Posto adicionado com sucesso!', 'success');
                } else {
                    showNotification('Erro ao adicionar posto', 'error');
                }
            } catch (error) {
                console.error('Error adding station:', error);
                showNotification('Erro ao conectar com o servidor', 'error');
            }
        }

        // Filter stations
        function filterStations(filter) {
            currentFilter = filter;
            document.querySelectorAll('.btn-filter').forEach(btn => {
                if (btn.dataset.filter === filter) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            renderStations();
        }

        // Modal functions
        function openAddModal() {
            document.getElementById('addModal').style.display = 'flex';
        }
        
        function closeAddModal() {
            document.getElementById('addModal').style.display = 'none';
        }
        
        // Notification
        function showNotification(message, type) {
            const notification = document.createElement('div');
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: ${type === 'success' ? '#48bb78' : '#f56565'};
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                z-index: 1001;
                animation: slideIn 0.3s ease;
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            `;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
        }

        // Add CSS animation for notification
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
        
        // Form submission
        document.getElementById('addStationForm').addEventListener('submit', addStation);
        
        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('addModal');
            if (event.target === modal) {
                closeAddModal();
            }
        }
        
        // Initial load
        fetchStations();
        
        // Auto-refresh every 2 minutes
        setInterval(fetchStations, 120000);
