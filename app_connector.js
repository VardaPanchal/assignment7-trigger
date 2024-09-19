const {
  HttpUtils,
  HttpUtils: { request, successResponse, errorResponse },
} = require("quickwork-adapter-cli-server/http-library");

const app = {
  name: "hubspot",
  alias: "hubspot",
  description: "HubSpot Adapter",
  version: "1",
  config: { authType: "oauth_2" },
  webhook_verification_required: false,
  internal: false,
  connection: {
    client_id: "5d5e78b5-300c-45f3-a735-a7dbec98a869",
    client_secret: "cef9d282-e116-411a-b77e-eb5e93120f70",
    redirect_uri: "https://proxy.quickwork.co.in/hubspot/code",
    authorization: {
      type: "oauth_2",
      authorization_url: async (connection) => {
        const scope = "crm.objects.contacts.write crm.objects.contacts.read oauth ";
        const url = `https://app.hubspot.com/oauth/authorize?client_id=${app.connection.client_id}&scope=${scope}&redirect_uri=${app.connection.redirect_uri}&state=${connection.id}`;
        return { url };
      },
      acquire: async (code, scope, state) => {
        try {
          const body = {
            client_id: app.connection.client_id,
            client_secret: app.connection.client_secret,
            grant_type: "authorization_code",
            code,
            redirect_uri: app.connection.redirect_uri,
          };

          const encodedCredentials = Buffer.from(`${app.connection.client_id}:${app.connection.client_secret}`).toString('base64');
          const headers = {
            Authorization: `Basic ${encodedCredentials}`,
            "Content-Type": "application/json",
          };

          const tokenURL = "https://api.hubapi.com/oauth/v1/token";
          const response = await request(tokenURL, headers, null, HttpUtils.HTTPMethods.POST, body);

          if (response.success) {
            const jsonResponse = JSON.parse(response.body);
            return successResponse({
              accessToken: jsonResponse.access_token,
              expires: jsonResponse.expires_in,
              refreshToken: jsonResponse.refresh_token,
            });
          } else {
            return errorResponse(response.body, response.statusCode);
          }
        } catch (error) {
          return errorResponse(error.message);
        }
      },
      refresh: async (connection) => {
        try {
          const body = new URLSearchParams({
            client_id: app.connection.client_id,
            client_secret: app.connection.client_secret,
            refresh_token: connection.oauthToken.refreshToken,
            grant_type: "refresh_token",
          });

          const encodedCredentials = Buffer.from(`${app.connection.client_id}:${app.connection.client_secret}`).toString('base64');
          const headers = {
            Authorization: `Basic ${encodedCredentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          };

          const response = await request("https://api.hubapi.com/oauth/v1/token", headers, null, HttpUtils.HTTPMethods.POST, body.toString(), HttpUtils.ContentTypes.FORM_URL_ENCODED);

          if (response.success) {
            const jsonResponse = JSON.parse(response.body);
            return successResponse({
              accessToken: jsonResponse.access_token,
              expires: jsonResponse.expires_in,
            });
          } else {
            return errorResponse(response.body, response.statusCode);
          }
        } catch (error) {
          return errorResponse(error.message);
        }
      },
      refresh_on: [401],
      detect_on: "",
      credentials: (connection) => ({
        accessToken: connection.oauthToken,
        Authorization: `Bearer ${connection.oauthToken.accessToken}`,
      }),
    }
  },
  actions: {},
  triggers: {
    getRecentContacts: {
      description: "Fetch newly created contacts from HubSpot.",
      hint: "Only fetch contacts created after the last successful fetch.",
      type: "poll",
      input_fields: () => [],
      execute: async (connection) => {
    
        if (!connection.lastCheckedTime) {
          connection.lastCheckedTime = new Date().toISOString(); 
        }
    
        const headers = app.connection.authorization.credentials(connection);
        const url = `https://api.hubapi.com/contacts/v1/lists/all/contacts/recent?count=100`;
        const response = await HttpUtils.request(url, headers, null, HttpUtils.HTTPMethods.GET);
    
        if (response.success) {
          let jsonResponse;
    
          if (typeof response.body === 'string') {
            try {
              jsonResponse = JSON.parse(response.body);
            } catch (error) {
              console.error("Failed to parse response body: ", error.message);
              return HttpUtils.errorResponse("Failed to parse response body.");
            }
          } else if (typeof response.body === 'object') {
            jsonResponse = response.body;
          } else {
            console.error("Unexpected response format.");
            return HttpUtils.errorResponse("Unexpected response format.");
          }
    
          const newContacts = jsonResponse.contacts.filter(contact => {
            const createdAt = contact.properties && contact.properties.createdate ? contact.properties.createdate.value : null;
            if (createdAt) {
              const createdDateUTC = new Date(parseInt(createdAt)); 
              return createdDateUTC.toISOString() > connection.lastCheckedTime; 
            }
            return false;
          });
    
          if (newContacts.length > 0) {
            connection.lastCheckedTime = new Date().toISOString(); 
            
            connection.previousContacts = newContacts;
            return HttpUtils.successResponse({
              contacts: newContacts,
              events: [],
              nextPoll: connection.lastCheckedTime, 
            });
          } else if (connection.previousContacts) {
            return HttpUtils.successResponse({
              contacts: connection.previousContacts, 
              events: [],
              nextPoll: connection.lastCheckedTime 
            });
          }
    
          return HttpUtils.successResponse({
            contacts: [], 
            events: [],
            nextPoll: connection.lastCheckedTime 
          });
        } else {
          return HttpUtils.errorResponse(response.body, response.statusCode);
        }
      },
      output_fields: () => [],
    },             
  },
  test: async (connection) => {
    try {
      const url = "https://api.hubapi.com/contacts/v1/lists/all/contacts/all";
      const headers = app.connection.authorization.credentials(connection);
      const response = await request(url, headers, null, HttpUtils.HTTPMethods.GET);

      if (response.success) {
        return successResponse(response.body);
      } else {
        return errorResponse(response.body, response.statusCode);
      }
    } catch (error) {
      return errorResponse(error.message);
    }
  },
  objectDefinitions: {
    event: [
      {
        key: "id",
        required: false,
        type: "string",
        controlType: "text",
        name: "Id",
        hintText: "Id",
      },
      {
        key: "status",
        required: false,
        type: "string",
        controlType: "text",
        name: "Status",
        hintText: "Status",
      },
    ]
  },
};

module.exports = app;
