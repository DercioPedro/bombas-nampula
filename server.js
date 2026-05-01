require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Aumentar limite para fotos
app.use(express.static(path.join(__dirname, 'public')));

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

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
        
        const stationsWithStatus = stations.map(station => {
            const gasolineStatus = station.gasoline_status || 'available';
            const dieselStatus = station.diesel_status || 'available';
            
            let generalStatus = 'unavailable';
            if (gasolineStatus === 'available' || dieselStatus === 'available') {
                generalStatus = 'available';
            }
            
            return {
                id: station.id,
                name: station.name,
                location: station.location,
                status: generalStatus,
                gasoline: gasolineStatus,
                diesel: dieselStatus,
                photo: station.photo || null,
                lastUpdate: station.updated_at || station.created_at
            };
        });
        
        res.json(stationsWithStatus);
    } catch (error) {
        console.error('Error fetching stations:', error);
        res.status(500).json({ error: 'Erro ao buscar postos: ' + error.message });
    }
});

// Rota para adicionar nova bomba (COM suporte a foto)
app.post('/api/stations', async (req, res) => {
    const { name, location, gasoline, diesel, photo } = req.body;
    
    console.log('Adicionando novo posto:', { name, location, gasoline, diesel, hasPhoto: !!photo });
    
    try {
        const { data: newStation, error: insertError } = await supabase
            .from('fuel_stations')
            .insert([{ 
                name, 
                location,
                gasoline_status: gasoline || 'available',
                diesel_status: diesel || 'available',
                photo: photo || null
            }])
            .select()
            .single();
        
        if (insertError) {
            console.error('Erro ao inserir posto:', insertError);
            throw insertError;
        }
        
        console.log('Posto criado com ID:', newStation.id);
        
        res.status(201).json({
            id: newStation.id,
            name: newStation.name,
            location: newStation.location,
            gasoline: gasoline || 'available',
            diesel: diesel || 'available',
            photo: photo || null,
            status: 'available',
            lastUpdate: new Date()
        });
    } catch (error) {
        console.error('Error adding station:', error);
        res.status(500).json({ error: 'Erro ao adicionar posto: ' + error.message });
    }
});

// Rota para reportar status (atualiza apenas se houver mudanca)
app.post('/api/stations/:id/report-fuel', async (req, res) => {
    const { id } = req.params;
    const { fuelType, status } = req.body;
    
    console.log(`Reportando ${fuelType} como ${status} para posto ${id}`);
    
    try {
        // Buscar status atual
        const { data: station, error: stationError } = await supabase
            .from('fuel_stations')
            .select('id, gasoline_status, diesel_status')
            .eq('id', id)
            .single();
        
        if (stationError || !station) {
            console.error('Posto nao encontrado:', id);
            return res.status(404).json({ error: 'Posto nao encontrado' });
        }
        
        // Obter status atual
        const currentStatus = fuelType === 'gasoline' ? station.gasoline_status : station.diesel_status;
        
        // Se o status ja e o mesmo, nao faz nada
        if (currentStatus === status) {
            console.log(`Status ja esta como ${status}, nao e necessario atualizar`);
            return res.json({
                success: true,
                message: 'Status ja atualizado',
                fuelType: fuelType,
                status: currentStatus,
                noChange: true
            });
        }
        
        // Atualizar o status
        const updateField = fuelType === 'gasoline' ? 'gasoline_status' : 'diesel_status';
        const { error: updateError } = await supabase
            .from('fuel_stations')
            .update({ 
                [updateField]: status,
                updated_at: new Date()
            })
            .eq('id', parseInt(id));
        
        if (updateError) {
            console.error('Erro ao atualizar status:', updateError);
            throw updateError;
        }
        
        console.log(`Status do ${fuelType} atualizado de ${currentStatus} para ${status}`);
        
        res.json({
            success: true,
            fuelType: fuelType,
            status: status,
            oldStatus: currentStatus,
            changed: true
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
    console.log(`API otimizada - evita atualizacoes desnecessarias`);
});
