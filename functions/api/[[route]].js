import app from "../../worker/index.js";

export const onRequest = async (context) => {
  try {
    return await app.fetch(context.request, context.env, context);
  } catch (err) {
    return new Response(JSON.stringify({ 
      error: err.message, 
      stack: err.stack,
      env_keys: Object.keys(context.env || {})
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
