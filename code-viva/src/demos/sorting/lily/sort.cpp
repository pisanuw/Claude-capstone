#include <vector>
using namespace std;

void insertionSort(vector<int>& v) {
    for (int i = 1; i < (int)v.size(); i++) {
        int k = v[i], j = i - 1;
        while (j >= 0 && v[j] > k) { v[j + 1] = v[j]; j--; }
        v[j + 1] = k;
    }
}

int part(vector<int>& v, int lo, int hi) {
    int p = v[hi], i = lo - 1;
    for (int j = lo; j < hi; j++) {
        if (v[j] <= p) { i++; swap(v[i], v[j]); }
    }
    swap(v[i + 1], v[hi]);
    return i + 1;
}

void quickSort(vector<int>& v, int lo, int hi) {
    if (lo < hi) {
        int q2 = part(v, lo, hi);
        quickSort(v, lo, q2 - 1);
        quickSort(v, q2 + 1, hi);
    }
}
