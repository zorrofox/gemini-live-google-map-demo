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

import './logger.css';

import cn from 'classnames';
import {JSX, ReactNode} from 'react';
import JsonView from '@uiw/react-json-view';
import {nordTheme} from '@uiw/react-json-view/nord';

interface ExtendedPart {
  groundingResult?: {
    output: string;
  };
  text?: string;
  executableCode?: {language: string; code: string};
  codeExecutionResult?: {outcome: string; output: string};
}

import {
  ClientContentMessage,
  isClientContentMessage,
  isInterrupted,
  isModelTurn,
  isServerContenteMessage,
  isToolCallCancellationMessage,
  isToolCallMessage,
  isToolResponseMessage,
  isTurnComplete,
  ModelTurn,
  ServerContentMessage,
  StreamingLog,
  ToolCallCancellationMessage,
  ToolCallMessage,
  ToolResponseMessage
} from '../../multimodal-live-types';
import {useLoggerStore} from '../../store/logger-store';
import {parseGroundingText} from '../live-client-handler/parse-grounding-text';

const formatTime = (d: Date) => d.toLocaleTimeString().slice(0, -3);

const LogEntry = ({
  log,
  MessageComponent
}: {
  log: StreamingLog;
  MessageComponent: ({
    message
  }: {
    message: StreamingLog['message'];
  }) => ReactNode;
}): JSX.Element => (
  <li
    className={cn(
      `plain-log`,
      `source-${log.type.slice(0, log.type.indexOf('.'))}`,
      {
        receive: log.type.includes('receive'),
        send: log.type.includes('send')
      }
    )}>
    <span className="timestamp">{formatTime(log.date)}</span>
    <span className="source">{log.type}</span>
    <span className="message">
      <MessageComponent message={log.message} />
    </span>
    {log.count && <span className="count">{log.count}</span>}
  </li>
);

const PlainTextMessage = ({message}: {message: StreamingLog['message']}) => (
  <span>{message as string}</span>
);

type Message = {message: StreamingLog['message']};

const AnyMessage = ({message}: Message) => (
  <JsonView
    displayDataTypes={false}
    displayObjectSize={false}
    collapsed={2}
    objectSortKeys={true}
    value={typeof message === 'string' ? {value: message} : message}
    style={nordTheme}
  />
);

function parseModelText(input: any): any {
  const result = {...input};

  if (!input.model_text) {
    return input;
  }

  const parsedModelText = parseGroundingText(input.model_text);

  if (parsedModelText) {
    result.model_text_parsed = parsedModelText;
  }

  return result;
}

const RenderPart = ({part}: {part: ExtendedPart}) => {
  const groundingResult = part.groundingResult
    ? parseModelText(part.groundingResult.output)
    : part.groundingResult;

  let otherContentResult = null;

  try {
    if (part.codeExecutionResult) {
      const outcome = part.codeExecutionResult.outcome;
      const result = JSON.parse(part.codeExecutionResult.output);

      if (
        result &&
        typeof result === 'object' &&
        (result.status || result.weather)
      ) {
        otherContentResult = {
          status: outcome,
          data: result
        };
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    /* empty */
  }

  return part.text && part.text.length ? (
    <p className="part part-text">{part.text}</p>
  ) : groundingResult ? (
    <div>
      <div>Grounding Result</div>

      {typeof groundingResult === 'object' ? (
        <div
          style={{
            padding: '14px',
            background: 'rgb(46, 52, 64)',
            borderRadius: '8px',
            marginTop: '8px'
          }}>
          <JsonView
            displayDataTypes={false}
            displayObjectSize={false}
            collapsed={2}
            objectSortKeys={true}
            value={groundingResult}
            style={nordTheme}
          />
        </div>
      ) : (
        groundingResult
      )}
    </div>
  ) : part.executableCode ? (
    <div>
      <h5>Executable Code: {part.executableCode.language}</h5>
      <pre>{part.executableCode.code}</pre>
    </div>
  ) : otherContentResult ? (
    <JsonView
      displayDataTypes={false}
      displayObjectSize={false}
      collapsed={2}
      objectSortKeys={true}
      value={otherContentResult}
      style={nordTheme}
    />
  ) : (
    ''
  );
};

const ClientContentLog = ({message}: Message) => {
  const {turns, turnComplete} = (message as ClientContentMessage).clientContent;
  return (
    <div className="rich-log client-content user">
      <h4 className="roler-user">User</h4>
      {turns.map((turn, i) => (
        <div key={`message-turn-${i}`}>
          {turn.parts
            .filter(part => !(part.text && part.text === '\n'))
            .map((part, j) => {
              return (
                <RenderPart part={part} key={`message-turh-${i}-part-${j}`} />
              );
            })}
        </div>
      ))}
      {!turnComplete ? <span>turnComplete: false</span> : ''}
    </div>
  );
};

const ToolCallLog = ({message}: Message) => {
  const {toolCall} = message as ToolCallMessage;
  return (
    <div className={cn('rich-log tool-call')}>
      {toolCall.functionCalls.map(fc => (
        <div key={fc.id} className="part part-functioncall">
          <JsonView
            displayDataTypes={false}
            displayObjectSize={false}
            collapsed={2}
            objectSortKeys={true}
            value={fc}
            style={nordTheme}
          />
        </div>
      ))}
    </div>
  );
};

const ToolCallCancellationLog = ({message}: Message): JSX.Element => (
  <div className={cn('rich-log tool-call-cancellation')}>
    <span>
      {' '}
      ids:{' '}
      {(message as ToolCallCancellationMessage).toolCallCancellation.ids.map(
        id => (
          <span className="inline-code" key={`cancel-${id}`}>
            "{id}"
          </span>
        )
      )}
    </span>
  </div>
);

const ToolResponseLog = ({message}: Message): JSX.Element => (
  <div className={cn('rich-log tool-response')}>
    {(message as ToolResponseMessage).toolResponse.functionResponses.map(fc => (
      <div key={`tool-response-${fc.id}`} className="part">
        <h5>Function Response: {fc.id}</h5>
        <JsonView
          displayDataTypes={false}
          displayObjectSize={false}
          collapsed={2}
          objectSortKeys={true}
          value={fc.response}
          style={nordTheme}
        />
      </div>
    ))}
  </div>
);

const ModelTurnLog = ({message}: Message): JSX.Element => {
  const serverContent = (message as ServerContentMessage).serverContent;
  const {modelTurn} = serverContent as ModelTurn;
  const {parts} = modelTurn;

  return (
    <div className="rich-log model-turn model">
      <h4 className="role-model">Model</h4>
      {parts
        .filter(part => !(part.text && part.text === '\n'))
        .map((part, j) => (
          <RenderPart part={part} key={`model-turn-part-${j}`} />
        ))}
    </div>
  );
};

const CustomPlainTextLog = (msg: string) => () => (
  <PlainTextMessage message={msg} />
);

export type LoggerFilterType = 'conversations' | 'tools' | 'none';

export type LoggerProps = {
  filter: LoggerFilterType;
};

const filters: Record<LoggerFilterType, (log: StreamingLog) => boolean> = {
  tools: (log: StreamingLog) =>
    isToolCallMessage(log.message) ||
    isToolResponseMessage(log.message) ||
    isToolCallCancellationMessage(log.message),
  conversations: (log: StreamingLog) =>
    isClientContentMessage(log.message) || isServerContenteMessage(log.message),
  none: () => true
};

const component = (log: StreamingLog) => {
  if (typeof log.message === 'string') {
    return PlainTextMessage;
  }
  if (isClientContentMessage(log.message)) {
    return ClientContentLog;
  }
  if (isToolCallMessage(log.message)) {
    return ToolCallLog;
  }
  if (isToolCallCancellationMessage(log.message)) {
    return ToolCallCancellationLog;
  }
  if (isToolResponseMessage(log.message)) {
    return ToolResponseLog;
  }
  if (isServerContenteMessage(log.message)) {
    const {serverContent} = log.message;
    if (isInterrupted(serverContent)) {
      return CustomPlainTextLog('interrupted');
    }
    if (isTurnComplete(serverContent)) {
      return CustomPlainTextLog('turnComplete');
    }
    if (isModelTurn(serverContent)) {
      return ModelTurnLog;
    }
  }
  return AnyMessage;
};

export default function Logger({filter = 'none'}: LoggerProps) {
  const {logs} = useLoggerStore();

  const filterFn = filters[filter];

  return (
    <div className="logger">
      <ul className="logger-list">
        {logs
          .filter(filterFn)
          .filter(log => {
            return (
              log.type !== 'client.realtimeInput' && log.type !== 'server.audio'
            );
          })
          .map((log, key) => {
            return (
              <LogEntry MessageComponent={component(log)} log={log} key={key} />
            );
          })}
      </ul>
    </div>
  );
}
