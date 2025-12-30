const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

//Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials:true
}));
app.use(express.json());

//Rate limiting to prevent abuse
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs : 15 * 60 * 1000, // 15 minutes
    max : 100, // limit each IP to 100requests per windowMs
    message: ' Too many requests,please try again later.'
});
app.use('/api/', limiter);

//Google Maps API Key from environment variable
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if(!GOOGLE_MAPS_API_KEY){
    console.error('ERROR: GOOGLE_MAPS_API_KEY not found in environment variables');
    process.exit(1);
}

// Nearby places endpoint
app.post('/api/places/nearby', async (req, res) => {
    try {
        const { location, radius, type, keyword } = req.body;

        // Validate input
        if (!location || !location.lat || !location.lng) {
            return res.status(400).json({
                error: 'Invalid location data. Please provide lat and lng.'
            });
        }

        // Build Google Places API URL
        const url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
        const params = {
            location: `${location.lat},${location.lng}`,
            radius: radius || 5000,
            key: GOOGLE_MAPS_API_KEY
        };
        if (type) params.type = type;
        if (keyword) params.keyword = keyword;

        // Make request to Google Places API
        const response = await axios.get(url, { params });

        // Return only necessary data to frontend
        const places = response.data.results.map(place => ({
            id: place.place_id,
            name: place.name,
            address: place.vicinity || place.formatted_address || '',
            location: place.geometry?.location,
            rating: place.rating || 0,
            userRatingsTotal: place.user_ratings_total || 0,
            priceLevel: place.price_level || 1,
            openNow: place.opening_hours?.open_now,
            types: place.types || [],
            photos: place.photos ? place.photos.slice(0, 1).map(photo => ({
                reference: photo.photo_reference,
                width: photo.width,
                height: photo.height
            })) : []
        }));

        res.json({
            success: true,
            places,
            count: places.length
        });
    } catch (error) {
        console.error('Error fetching places:', error.message);
        if (error.response) {
            return res.status(error.response.status).json({
                error: 'Failed to fetch places from Google',
                details: error.response.data
            });
        }
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch nearby places'
        });
    }
});

app.get('/api/places/details/:placeId', async(req,res) => {
    try{
        const{placeId} = req.params;
        if(!placeId){
            return res.status(400).json({error: 'Place Id is required'});

        }
        const url = 'https://maps.googleapis.com/maps/api/place/details/json';
        const params = {
            place_id: placeId,
            fields: 'name,rating,formatted_phone_number,opening_hours,website,price_level,reviews',
            key: GOOGLE_MAPS_API_KEY
        };

        const response = await axios.get(url, {params});
        res.json({
            success:true,
            place: response.data.result
        });
    }
    catch(error){
        console.error('Error fetching place details:', error.message);
        res.status(500).json({
            error: 'Failed to fetch place details'
        });
    }
});

app.get('/api/places/photo/:photoReference', (req,res) => {
    try{
        const {photoReference} = req.params;
        const maxWidth = req.query.maxWidth || 400;
        if(!photoReference){
            return res.status(400).json({error: 'Photo reference is required'});        
        }

        const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photoreference=${photoReference}&key=${GOOGLE_MAPS_API_KEY}`;

        res.json({
            success:true,
            url: photoUrl
        });
    
    }catch(error){
        console.error('Error generating photo URL:', error.message);
        res.status(500).json({ error: 'Failed to generate photo URL' });
    }
});

app.post('/api/places/search', async(req,res) =>{
    try{
        const { query, location, radius } = req.body;
        if(!query){
            return res.status(400).json({error: 'Search query is required'});
        }
        const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
        const params = {
            query,
            key : GOOGLE_MAPS_API_KEY
        };
        
        if(location){
            params.location = `${location.lat},${location.lng}`;
            params.radius = radius || 5000;
        
        }

        const response = await axios.get(url, {params});

        const places = response.data.results.map(place => ({
            id: place.place_id,
            name: place.name,
            address: place.formatted_address,
            location: place.geometry.location,
            rating: place.rating || 0,
            userRatingsTotal: place.user_ratings_total || 0,
            priceLevel: place.price_level || 1,
            openNow: place.opening_hours?.open_now,
            types: place.types
        }));

        res.json({
            success: true,
            places,
            count: places.length

        });
    }
    catch(error){
        console.error('Error searching places:', error.message);
        res.status(500).json({error: 'Failed to search places'});
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`Google Maps API Key: ${GOOGLE_MAPS_API_KEY ? 'Loaded' : 'Missing'}`);
});