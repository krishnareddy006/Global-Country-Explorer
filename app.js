import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.COUNTRYLAYER_API_KEY;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Helper function to fetch country data from REST Countries API (more reliable)
async function fetchCountryData(searchType, searchValue) {
    try {
        let apiUrl = '';
        const baseUrl = 'https://restcountries.com/v3.1';
        
        switch (searchType) {
            case 'country':
                apiUrl = `${baseUrl}/name/${encodeURIComponent(searchValue)}?fullText=false`;
                break;
            case 'capital':
                apiUrl = `${baseUrl}/capital/${encodeURIComponent(searchValue)}`;
                break;
            case 'region':
                apiUrl = `${baseUrl}/region/${encodeURIComponent(searchValue)}`;
                break;
            default:
                throw new Error('Invalid search type');
        }

        const response = await axios.get(apiUrl, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Global-Country-Explorer/1.0'
            }
        });

        if (!response.data || response.data.length === 0) {
            return [];
        }

        // Return all matching countries (not just first one)
        const countries = Array.isArray(response.data) ? response.data : [response.data];
        return countries.map(country => normalizeCountryData(country));

    } catch (error) {
        if (error.response?.status === 404) {
            return [];
        }
        console.error('API Error:', error.message);
        throw new Error('Failed to fetch country data. Please try again.');
    }
}

// Function to get single country by name for modal
async function fetchSingleCountry(countryName) {
    try {
        const apiUrl = `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fullText=true`;
        
        const response = await axios.get(apiUrl, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Global-Country-Explorer/1.0'
            }
        });

        if (!response.data || response.data.length === 0) {
            return null;
        }

        const country = Array.isArray(response.data) ? response.data[0] : response.data;
        return normalizeCountryData(country);

    } catch (error) {
        console.error('Single Country API Error:', error.message);
        return null;
    }
}

// Function to normalize country data
function normalizeCountryData(country) {
    return {
        name: country.name?.common || country.name || 'N/A',
        officialName: country.name?.official || 'N/A',
        capital: Array.isArray(country.capital) ? country.capital.join(', ') : (country.capital?.[0] || 'N/A'),
        region: country.region || 'N/A',
        subregion: country.subregion || 'N/A',
        area: country.area ? country.area.toLocaleString() + ' km²' : 'N/A',
        population: country.population ? country.population.toLocaleString() : 'N/A',
        languages: country.languages ? Object.values(country.languages).join(', ') : 'N/A',
        currencies: country.currencies ? 
            Object.entries(country.currencies)
                .map(([code, curr]) => `${curr.name} (${curr.symbol || code})`)
                .join(', ') : 'N/A',
        timezones: Array.isArray(country.timezones) ? country.timezones.join(', ') : 'N/A',
        borders: Array.isArray(country.borders) && country.borders.length > 0 ? 
            country.borders.join(', ') : 'No land borders',
        latlng: Array.isArray(country.latlng) ? `${country.latlng[0]}°, ${country.latlng[1]}°` : 'N/A',
        nativeName: country.name?.nativeName ? 
            Object.values(country.name.nativeName)[0]?.common || 'N/A' : 'N/A',
        topLevelDomain: Array.isArray(country.tld) ? country.tld.join(', ') : 'N/A',
        alpha3Code: country.cca3 || 'N/A',
        callingCodes: country.idd ? 
            `${country.idd.root}${country.idd.suffixes?.[0] || ''}` : 'N/A',
        flag: country.flags?.svg || country.flags?.png || null,
        coatOfArms: country.coatOfArms?.svg || country.coatOfArms?.png || null
    };
}

// Routes

// Homepage
app.get('/', (req, res) => {
    res.render('index', {
        title: 'Global Country Explorer',
        currentPage: 'home',
        countries: [],
        error: null,
        searchPerformed: false
    });
});

// Search route - returns multiple matching countries
app.post('/search', async (req, res) => {
    const { countrySearch, capitalSearch, regionSearch } = req.body;
    
    try {
        let searchType = '';
        let searchValue = '';
        
        if (countrySearch && countrySearch.trim()) {
            searchType = 'country';
            searchValue = countrySearch.trim();
        } else if (capitalSearch && capitalSearch.trim()) {
            searchType = 'capital';
            searchValue = capitalSearch.trim();
        } else if (regionSearch && regionSearch.trim()) {
            searchType = 'region';
            searchValue = regionSearch.trim();
        } else {
            return res.render('index', {
                title: 'Global Country Explorer',
                currentPage: 'home',
                countries: [],
                error: 'Please fill at least one search field',
                searchPerformed: true
            });
        }

        const countries = await fetchCountryData(searchType, searchValue);
        
        if (countries.length === 0) {
            return res.render('index', {
                title: 'Global Country Explorer',
                currentPage: 'home',
                countries: [],
                error: `No countries found for "${searchValue}". Please check your spelling and try again.`,
                searchPerformed: true
            });
        }

        res.render('index', {
            title: 'Global Country Explorer',
            currentPage: 'home',
            countries,
            error: null,
            searchPerformed: true
        });
        
    } catch (error) {
        console.error('Search Error:', error.message);
        res.render('index', {
            title: 'Global Country Explorer',
            currentPage: 'home',
            countries: [],
            error: error.message || 'An error occurred while searching. Please try again.',
            searchPerformed: true
        });
    }
});

// Modal route for single country details
app.get('/view/:countryName', async (req, res) => {
    const { countryName } = req.params;
    
    try {
        const country = await fetchSingleCountry(countryName);
        
        if (!country) {
            return res.status(404).json({ 
                error: 'Country not found' 
            });
        }

        // Return JSON for AJAX request
        res.json({
            success: true,
            country: country
        });
        
    } catch (error) {
        console.error('Modal Country Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to fetch country details' 
        });
    }
});

// About page
app.get('/about', (req, res) => {
    res.render('about', {
        title: 'About - Global Country Explorer',
        currentPage: 'about'
    });
});

// Contact form submission
app.post('/contact', (req, res) => {
    const { name, email, message } = req.body;
    
    console.log('Contact Form Submission:', { name, email, message });
    
    res.render('index', {
        title: 'Global Country Explorer',
        currentPage: 'home',
        countries: [],
        error: null,
        searchPerformed: false,
        contactSuccess: 'Thank you for your message! We will get back to you soon.'
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).render('index', {
        title: 'Global Country Explorer',
        currentPage: 'home',
        countries: [],
        error: 'The page you are looking for does not exist.',
        searchPerformed: false
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('index', {
        title: 'Global Country Explorer',
        currentPage: 'home',
        countries: [],
        error: 'Something went wrong on our end. Please try again later.',
        searchPerformed: false
    });
});

app.listen(PORT, () => {
    console.log(`🌍 Global Country Explorer running on http://localhost:${PORT}`);
    console.log(`📡 API Key configured: ${API_KEY ? 'YES' : 'NO'}`);
});
