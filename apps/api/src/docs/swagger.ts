export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Smart Ambulance Emergency Mobility Platform API',
    version: '1.0.0',
    description: 'High-performance real-time emergency passage network connecting Ambulance Drivers, Road Users, and Emergency Control Center.'
  },
  servers: [
    { url: 'http://localhost:5000/api', description: 'Local Development Server' }
  ],
  paths: {
    '/auth/register': {
      post: {
        summary: 'Register new user account',
        tags: ['Auth'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  password: { type: 'string' },
                  role: { type: 'string', enum: ['NORMAL_USER', 'AMBULANCE_DRIVER', 'ADMIN', 'HOSPITAL_OPERATOR'] }
                },
                required: ['name', 'email', 'password']
              }
            }
          }
        },
        responses: { 201: { description: 'User registered' } }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate and retrieve JWT',
        tags: ['Auth'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' }
                },
                required: ['email', 'password']
              }
            }
          }
        },
        responses: { 200: { description: 'Authenticated with JWT' } }
      }
    },
    '/users/location': {
      post: {
        summary: 'Update normal driver GPS location for corridor alerts',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  latitude: { type: 'number' },
                  longitude: { type: 'number' },
                  speed: { type: 'number' },
                  heading: { type: 'number' }
                },
                required: ['latitude', 'longitude']
              }
            }
          }
        },
        responses: { 200: { description: 'Location saved securely' } }
      }
    },
    '/ambulances/{id}/location': {
      post: {
        summary: 'Ambulance live GPS update (every 3-5 seconds)',
        tags: ['Ambulances'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  latitude: { type: 'number' },
                  longitude: { type: 'number' },
                  speed: { type: 'number' },
                  heading: { type: 'number' },
                  accuracy: { type: 'number' }
                },
                required: ['latitude', 'longitude']
              }
            }
          }
        },
        responses: { 200: { description: 'GPS updated and passage corridor evaluated' } }
      }
    },
    '/emergencies/{id}/start': {
      post: {
        summary: 'Start emergency trip and activate Emergency Passage Network',
        tags: ['Emergencies'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Emergency active and passage network activated' } }
      }
    },
    '/routes/emergency': {
      post: {
        summary: 'Calculate priority emergency route',
        tags: ['Routes'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  origin: { type: 'object', properties: { latitude: { type: 'number' }, longitude: { type: 'number' } } },
                  destination: { type: 'object', properties: { latitude: { type: 'number' }, longitude: { type: 'number' } } }
                }
              }
            }
          }
        },
        responses: { 200: { description: 'Calculated route with emergency geometry and steps' } }
      }
    },
    '/hospitals/nearby': {
      get: {
        summary: 'Get nearby hospitals with multi-factor emergency recommendation scoring',
        tags: ['Hospitals'],
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'lng', in: 'query', required: true, schema: { type: 'number' } }
        ],
        responses: { 200: { description: 'Ranked list of hospitals' } }
      }
    },
    '/admin/demo/start': {
      post: {
        summary: 'Trigger complete end-to-end automated emergency passage simulation',
        tags: ['Admin Demo'],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Simulation started' } }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};
