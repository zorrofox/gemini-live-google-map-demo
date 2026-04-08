# How the AI Agent Speaks First in the Demo

## Overview
This demo uses a clever mechanism to make the AI agent initiate the conversation instead of waiting for user input. Here's how it works:

## The Key Mechanism

### 1. **Frontend Trigger (intro.tsx)**
The magic happens in the `app-starter-pack/frontend/src/components/intro/intro.tsx` file:

```typescript
useEffect(() => {
  if (!connected) return;

  setTimeout(() => {
    client.send([{text: 'Hi'}]);
  }, 1000);
}, [connected]);
```

### 2. **How It Works**

1. **Connection Established**: When the user clicks "Start now!" button, the WebSocket connection to the backend is established.

2. **Automatic Message Send**: Once the connection is confirmed (`connected` becomes true), a `useEffect` hook triggers.

3. **Delayed "Hi" Message**: After a 1-second delay (using `setTimeout`), the frontend automatically sends a simple "Hi" message to the backend on behalf of the user.

4. **AI Response**: The AI agent receives this "Hi" message and responds according to its system instructions, which are configured to:
   - Greet the user warmly
   - Start asking about their evening plans in Singapore
   - Begin the itinerary planning conversation

### 3. **System Instructions**
The AI's personality and initial response behavior are defined in `app-starter-pack/app/templates.py`:

- The AI is instructed to act as a tour guide in Singapore
- It assumes users are attending the Google Cloud AI Asia Event
- It has a warm, approachable tone
- Different personas (Aoede, Charon, Fenrir, Puck, Kore, Marvin) provide variety in conversation style

### 4. **Why This Approach?**

This design pattern has several benefits:

1. **User Experience**: The AI appears proactive and welcoming, immediately engaging the user
2. **Conversation Flow**: Eliminates the awkward "waiting for user to speak first" moment
3. **Context Setting**: The AI can immediately establish the context (Singapore tour planning)
4. **Simplicity**: No complex backend logic needed - just a simple frontend trigger

## Technical Flow

```
1. User clicks "Start now!"
   ↓
2. WebSocket connection established
   ↓
3. Frontend waits 1 second
   ↓
4. Frontend sends "Hi" message automatically
   ↓
5. Backend receives "Hi" and triggers AI response
   ↓
6. AI responds with greeting and starts conversation
```

## Key Files Involved

- **Frontend Trigger**: `app-starter-pack/frontend/src/components/intro/intro.tsx`
- **WebSocket Client**: `app-starter-pack/frontend/src/utils/multimodal-live-client.ts`
- **Backend Handler**: `app-starter-pack/app/server.py`
- **AI Configuration**: `app-starter-pack/app/agent.py`
- **System Instructions**: `app-starter-pack/app/templates.py`

## Customization

To modify this behavior, you could:

1. **Change the initial message**: Replace `'Hi'` with any other text
2. **Adjust the delay**: Change the `1000` milliseconds timeout
3. **Add conditions**: Make the auto-message conditional based on user preferences
4. **Remove auto-start**: Delete the `useEffect` to require manual user input first

## Alternative Approaches

Other ways to achieve "AI speaks first":

1. **Backend-initiated**: Have the server send an initial message upon connection
2. **System prompt**: Configure the AI to always start with a greeting (less reliable)
3. **Pre-recorded message**: Play a pre-recorded greeting before live connection
4. **Event-based**: Trigger on specific events like camera/microphone activation
