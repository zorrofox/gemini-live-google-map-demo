import {useEffect} from 'react';
import {useLiveAPIContext} from '../../contexts/LiveAPIContext';
import {ItineraryItemType, useGlobalStore} from '../../store/store';
import {getItineraryItems} from './get-itinerary-items';
import {useLoggerStore} from '../../store/logger-store';
import {HELPER_CHIPS} from '../../config/conversation-chips';

interface FunctionCall {
  name: string;
  args: {
    prompt?: string;
    order?: Array<ItineraryItemType>;
    topic?: string;
  };
}

export default function LiveClientHandler() {
  const {client} = useLiveAPIContext();
  const placeDetails = useGlobalStore(state => state.placeDetails);
  const addItineraryItem = useGlobalStore(state => state.addItineraryItem);
  const itineraryItems = useGlobalStore(state => state.itineraryItems);
  const {log} = useLoggerStore();

  const setCurrentSuggestions = useGlobalStore(
    state => state.setCurrentSuggestions
  );
  const setView = useGlobalStore(state => state.setView);
  const setMapTrigger = useGlobalStore(state => state.setMapTrigger);

  const setPhotoGallery = useGlobalStore(state => state.setPhotoGallery);
  const setGeminiStatus = useGlobalStore(state => state.setGeminiStatus);
  const setConversationChips = useGlobalStore(
    state => state.setConversationChips
  );
  const changeItineraryOrder = useGlobalStore(
    state => state.changeItineraryOrder
  );
  const setResponseInProgress = useGlobalStore(
    state => state.setResponseInProgress
  );
  const buildGeminiTextResponse = useGlobalStore(
    state => state.buildGeminiTextResponse
  );

  // listen for log events and store them
  useEffect(() => {
    client.on('log', log);
    return () => {
      client.off('log', log);
    };
  }, [client, log]);

  useEffect(() => {
    const processToolCall = (toolCall: {functionCalls: FunctionCall[]}) => {
      toolCall.functionCalls?.forEach((functionCall: FunctionCall) => {
        if (
          [
            'get_hotel_suggestions',
            'get_restaurant_suggestions',
            'get_activity_suggestions',
            'select_hotel',
            'select_restaurant',
            'select_activity',
            'show_place_photos',
            'get_place_information'
          ].includes(functionCall.name)
        ) {
          setView('map');
          setGeminiStatus(functionCall.name, functionCall.args.prompt);
        }

        if (
          functionCall.name.startsWith('select_') ||
          functionCall.name === 'hide_photos'
        ) {
          setPhotoGallery('');
        }

        if (functionCall.name === 'change_itinerary_order') {
          if (functionCall.args?.order?.length === 3) {
            changeItineraryOrder(
              functionCall.args?.order as Array<ItineraryItemType>
            );
          }
        }

        if (functionCall.name === 'transition_to_itinerary_topic') {
          if (
            ['hotel', 'restaurant', 'activity'].includes(
              functionCall.args?.topic ?? ''
            )
          ) {
            setConversationChips(
              HELPER_CHIPS[
                `${functionCall.args?.topic}_topic` as keyof typeof HELPER_CHIPS
              ]
            );
          }
        }

        if (functionCall.name === 'submit_itinerary') {
          // 触发最终行程展示动画
          setMapTrigger('showFinalItinerary', true);
        }
      });
    };

    const processContent = (content: any) => {
      if (content.modelTurn) {
        for (const element of content.modelTurn.parts) {
          if (element.text) {
            buildGeminiTextResponse(element.text);
            setResponseInProgress(true);
          }
        }
      }

      if (content.groundingResponse) {
        log({
          date: new Date(),
          type: 'server.content',
          message: {
            serverContent: {
              modelTurn: {
                parts: [
                  {
                    groundingResult: {
                      output: content.groundingResponse
                    }
                  } as any
                ]
              }
            }
          }
        });

        if (content.name === 'get_hotel_suggestions_result') {
          const currentSuggestions = getItineraryItems(
            content,
            'lodging' as const,
            placeDetails
          );

          if (currentSuggestions) {
            setCurrentSuggestions(currentSuggestions);
            setConversationChips(HELPER_CHIPS.hotel_suggestions);
          }
        }

        if (content.name === 'get_restaurant_suggestions_result') {
          const currentSuggestions = getItineraryItems(
            content,
            'restaurant' as const,
            placeDetails
          );

          if (currentSuggestions) {
            setCurrentSuggestions(currentSuggestions);
            setConversationChips(HELPER_CHIPS.restaurant_suggestions);
          }
        }
        if (content.name === 'get_activity_suggestions_result') {
          const currentSuggestions = getItineraryItems(
            content,
            'activity' as const,
            placeDetails
          );

          if (currentSuggestions) {
            setCurrentSuggestions(currentSuggestions);
            setConversationChips(HELPER_CHIPS.activity_suggestions);
          }
        }
        if (content.name === 'select_hotel_result') {
          const itineraryItem = getItineraryItems(
            content,
            'lodging' as const,
            placeDetails
          )?.[0];

          if (itineraryItem) {
            addItineraryItem(itineraryItem);
            setConversationChips(HELPER_CHIPS.restaurant_topic);
          }
        }

        if (content.name === 'select_restaurant_result') {
          const itineraryItem = getItineraryItems(
            content,
            'restaurant' as const,
            placeDetails
          )?.[0];

          if (itineraryItem) {
            addItineraryItem(itineraryItem);
            setConversationChips(HELPER_CHIPS.activity_topic);
          }
        }

        if (content.name === 'select_activity_result') {
          const itineraryItem = getItineraryItems(
            content,
            'activity' as const,
            placeDetails
          )?.[0];

          if (itineraryItem) {
            addItineraryItem(itineraryItem);
            setConversationChips([]);
          }
        }

        if (content.name === 'show_place_photos_result') {
          const placeId =
            content.groundingResponse?.grounding_metadata?.supportChunks?.[0]?.sourceMetadata?.document_id?.slice(
              7
            );

          if (placeId) {
            setPhotoGallery(placeId);
          } else {
            console.info(
              'No placeId found in grounding response for showing photos'
            );
          }
        }

        setGeminiStatus('');
      }
    };

    const handleTurnComplete = () => {
      setResponseInProgress(false);
    };

    // native audio 模型通过 outputTranscription 提供文字，而非 modelTurn.parts[].text
    const handleTranscription = (text: string) => {
      buildGeminiTextResponse(text);
      setResponseInProgress(true);
    };

    client.on('toolcall', processToolCall);
    client.on('content', processContent);
    client.on('turncomplete', handleTurnComplete);
    client.on('transcription', handleTranscription);
    return () => {
      client.off('toolcall', processToolCall);
      client.off('content', processContent);
      client.off('turncomplete', handleTurnComplete);
      client.off('transcription', handleTranscription);
    };
  }, [
    addItineraryItem,
    buildGeminiTextResponse,
    changeItineraryOrder,
    client,
    itineraryItems,
    log,
    placeDetails,
    setConversationChips,
    setCurrentSuggestions,
    setGeminiStatus,
    setMapTrigger,
    setPhotoGallery,
    setResponseInProgress,
    setView
  ]);

  return null;
}
