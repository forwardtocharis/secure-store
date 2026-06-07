import app from "../../worker/index.js";

export const onRequest = async (context) => {
  try {
    return await app.fetch(context.request, context.env, context);
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ 
      error: 'Internal Server Error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
