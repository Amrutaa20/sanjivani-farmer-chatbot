import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Farmer {
  private apiUrl = 'http://localhost:3000/api/farmers';

  constructor(private http: HttpClient) {}

  getFarmers(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }
}