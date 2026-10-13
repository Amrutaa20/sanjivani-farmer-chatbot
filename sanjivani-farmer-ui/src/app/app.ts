import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  question = '';
  loading = false;

  messages: ChatMessage[] = [
    {
      role: 'assistant',
      content:
        'Hello! 👋 Welcome to Sanjivani AI. Ask me about farmers, sugarcane supply, or pending payments.'
    }
  ];

  constructor(private cdr: ChangeDetectorRef) {}

  async askQuestion(): Promise<void> {
    const question = this.question.trim();

    if (!question || this.loading) {
      return;
    }

    // Display the user's question immediately.
    this.messages.push({
      role: 'user',
      content: question
    });

    this.question = '';
    this.loading = true;
    this.cdr.detectChanges();

    try {
      console.log('Sending question to backend:', question);

      const response = await fetch(
        'http://localhost:3000/api/ai/ask',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ question })
        }
      );

      const data: { answer?: string; error?: string } =
        await response.json();

      console.log('Backend response:', data);

      if (!response.ok) {
        throw new Error(
          data.error || `Server error: ${response.status}`
        );
      }

      // Display the AI answer in the website chat.
      this.messages.push({
        role: 'assistant',
        content: data.answer || 'The AI returned an empty answer.'
      });

    } catch (error) {
      console.error('Failed to get AI answer:', error);

      this.messages.push({
        role: 'assistant',
        content:
          error instanceof Error
            ? error.message
            : 'Unable to connect to the backend.'
      });

    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
}