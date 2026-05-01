require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Função para calcular status do combustível com contagem de votos
async function calculateFuelStatus(stationId, fuelType) {
    try {
        const { data: reports, error } = await supabase
            .from('reports')
            .select('status')
            .eq('station_id', stationId)
            .eq('fuel_type', fuelType)
            .order('created_at', { ascending: false });
        
        if (error || !reports || reports.length === 0) {
            return { status: 'available', availableVotes: 0, unavailableVotes: 0 };
        }
        
        let availableVotes = 0;
        let unavailableVotes = 0;
        
        reports.forEach(report => {
            if (report.status === 'available') {
                availableVotes++;
            } else {
                unavailableVotes++;
            }
        });
        
        // O status é decidido pela maioria dos votos
        const status = availableVotes >= unavailableVotes ? 'available' : 'unavailable';
        
        return { 
            status, 
            availableVotes, 
            unavailableVotes 
        };
    } catch (error) {
        console.error('Error calculating fuel status:', error);
        return { status: 'available', availableVotes: 0, unavailableVotes: 0 };
    }
}

// Rota para listar todos os postos
app.get('/api/stations', async (req, res) => {
    try {
        console.log('Buscando postos...');
        
        const { data: stations, error: stationsError } = await supabase
            .from('fuel_stations')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (stationsError) {
            console.error('Erro ao buscar postos:', stationsError);
            throw stationsError;
        }
        
        if (!stations || stations.length === 0) {
            return res.json([]);
        }
        
        const stationsWithStatus = await Promise.all(stations.map(async (station) => {
            // Buscar status atual para Gasolina e Diesel
            const gasolineData = await calculateFuelStatus(station.id, 'gasoline');
            const dieselData = await calculateFuelStatus(station.id, 'diesel');
            
            // Buscar todos os reports para contar confirmacoes
            const { data: reports, error: reportsError } = await supabase
                .from('reports')
                .select('*')
                .eq('station_id', station.id)
                .order('created_at', { ascending: false });
            
            if (reportsError) {
                console.error(`Erro ao buscar reports do posto ${station.id}:`, reportsError);
            }
            
            const confirmations = reports?.filter(r => r.status === 'available').length || 0;
            const lastUpdate = reports && reports.length > 0 ? reports[0].created_at : station.created_at;
            
            // Status geral do posto (se pelo menos um combustivel disponivel)
            let generalStatus = 'unavailable';
            if (gasolineData.status === 'available' || dieselData.status === 'available') {
                generalStatus = 'available';
            } else {
                generalStatus = 'unavailable';
            }
            
            return {
                id: station.id,
                name: station.name,
                location: station.location,
                status: generalStatus,
                gasoline: gasolineData.status,
                diesel: dieselData.status,
                gasolineAvailableVotes: gasolineData.availableVotes,
                gasolineUnavailableVotes: gasolineData.unavailableVotes,
                dieselAvailableVotes: dieselData.availableVotes,
                dieselUnavailableVotes: dieselData.unavailableVotes,
                reportsCount: reports?.length || 0,
                confirmations: confirmations,
                lastUpdate: lastUpdate
            };
        }));
        
        res.json(stationsWithStatus);
    } catch (error) {
        console.error('Error fetching stations:', error);
        res.status(500).json({ error: 'Erro ao buscar postos: ' + error.message });
    }
});

// Rota para adicionar nova bomba
app.post('/api/stations', async (req, res) => {
    const { name, location, gasoline, diesel } = req.body;
    
    console.log('Adicionando novo posto:', { name, location, gasoline, diesel });
    
    try {
        const { data: newStation, error: insertError } = await supabase
            .from('fuel_stations')
            .insert([{ 
                name, 
                location
            }])
            .select()
            .single();
        
        if (insertError) {
            console.error('Erro ao inserir posto:', insertError);
            throw insertError;
        }
        
        console.log('Posto criado com ID:', newStation.id);
        
        // Adicionar reports iniciais
        if (gasoline) {
            await supabase
                .from('reports')
                .insert([{
                    station_id: newStation.id,
                    fuel_type: 'gasoline',
                    status: gasoline
                }]);
        }
        
        if (diesel) {
            await supabase
                .from('reports')
                .insert([{
                    station_id: newStation.id,
                    fuel_type: 'diesel',
                    status: diesel
                }]);
        }
        
        res.status(201).json({
            ...newStation,
            gasoline: gasoline || 'available',
            diesel: diesel || 'available',
            reportsCount: (gasoline ? 1 : 0) + (diesel ? 1 : 0),
            confirmations: (gasoline === 'available' ? 1 : 0) + (diesel === 'available' ? 1 : 0),
            lastUpdate: new Date()
        });
    } catch (error) {
        console.error('Error adding station:', error);
        res.status(500).json({ error: 'Erro ao adicionar posto: ' + error.message });
    }
});

// Rota para reportar status de um combustivel especifico
app.post('/api/stations/:id/report-fuel', async (req, res) => {
    const { id } = req.params;
    const { fuelType, status } = req.body;
    
    console.log(`Reportando ${fuelType} como ${status} para posto ${id}`);
    
    try {
        // Verificar se o posto existe
        const { data: station, error: stationError } = await supabase
            .from('fuel_stations')
            .select('id')
            .eq('id', id)
            .single();
        
        if (stationError || !station) {
            console.error('Posto nao encontrado:', id);
            return res.status(404).json({ error: 'Posto nao encontrado' });
        }
        
        // Adicionar novo report
        const { error: reportError } = await supabase
            .from('reports')
            .insert([{
                station_id: parseInt(id),
                fuel_type: fuelType,
                status: status
            }]);
        
        if (reportError) {
            console.error('Erro ao adicionar report:', reportError);
            throw reportError;
        }
        
        // Calcular novo status para o combustivel
        const fuelData = await calculateFuelStatus(parseInt(id), fuelType);
        
        console.log(`Report registrado! Novo status do ${fuelType}: ${fuelData.status}`);
        
        res.json({
            success: true,
            fuelType: fuelType,
            status: fuelData.status,
            availableVotes: fuelData.availableVotes,
            unavailableVotes: fuelData.unavailableVotes,
            totalReports: fuelData.availableVotes + fuelData.unavailableVotes
        });
    } catch (error) {
        console.error('Error reporting status:', error);
        res.status(500).json({ error: 'Erro ao registrar reporte: ' + error.message });
    }
});

// Rota para servir o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Conectado ao Supabase`);
    console.log(`API pronta para Gasolina e Diesel`);
});
