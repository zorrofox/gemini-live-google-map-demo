/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {useLiveAPIContext} from '../../contexts/LiveAPIContext';

export default function ConveniencePanel() {
  const {connected, client} = useLiveAPIContext();

  const sendText = (text: string) => {
    if (connected) {
      client.send([{text}]);
    }
  };

  return (
    <div style={{background: 'white'}}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: '4px'
        }}>
        <button
          onClick={() => {
            sendText('Yep, in Las Vegas for the Google Cloud Next conference');
          }}>
          LV for Cloud Next
        </button>
        <button
          onClick={() => {
            sendText('We are a party of two');
          }}>
          Party of two.
        </button>
        <button
          onClick={() => {
            sendText('We are a staying at the Bellagio');
          }}>
          Bellagio
        </button>
        <button
          onClick={() => {
            sendText('Italien food please, no dietary restrictions');
          }}>
          Italian Restaurant
        </button>
        <button
          onClick={() => {
            sendText(
              'Hi, we are in Las Vegas for the Google Cloud Next. We are a party of two and staying at the Bellagio'
            );
          }}>
          at the bellagio
        </button>
        <button
          onClick={() => {
            sendText(
              'Hi, we are in Las Vegas for the Google Cloud Next. We are a party of two and staying at the Bellagio, please skip to gather food preferences'
            );
          }}>
          Skip to restaurant
        </button>
        <button
          onClick={() => {
            sendText('suggestions, italien, no restrictions');
          }}>
          suggestions italien
        </button>
        <button
          onClick={() => {
            sendText(
              'I dont have an hotel yet, please give me some recommendations, anything on the strip is fine'
            );
          }}>
          no hotel yet
        </button>
        <button
          onClick={() => {
            sendText('ok.');
          }}>
          Ok
        </button>
        <button
          onClick={() => {
            sendText('visualize the suggestions please');
          }}>
          visualize please
        </button>
        <button
          onClick={() => {
            sendText('yes');
          }}>
          yes
        </button>
        <button
          onClick={() => {
            sendText('recommendations please, no restrictions');
          }}>
          recommendations
        </button>
        <button
          onClick={() => {
            sendText('hi there');
          }}>
          hi
        </button>
        <button
          onClick={() => {
            sendText(
              'we are a party of two, lets select the bellagio as the lodging/hotel, the eiffel tower restaurant for dinner and than "the forum shops at caesers" for an activity'
            );
          }}>
          bellagio/eiffel tower/forum
        </button>
        <button
          onClick={() => {
            sendText(
              'we are a party of two, lets select the golden nugget as the lodging/hotel, the nacho daddy restaurant for dinner and then top golf for an activity'
            );
          }}>
          Golden nugget/nacho daddy/top golf
        </button>
        <button
          onClick={() => {
            sendText('yes, submit the itinerary please');
          }}>
          submit
        </button>
        <button
          onClick={() => {
            sendText('could you show me photos of the bellagio please');
          }}>
          bellagio photos
        </button>
      </div>
    </div>
  );
}
